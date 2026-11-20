'use strict';

(() => {
  const $ = id => document.getElementById(id);
  const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
  const numbers = new Intl.NumberFormat('es-MX');
  const dates = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
  const views = {
    dashboard: ['Dashboard', 'Una vista clara de tu inventario, en tiempo real.'],
    productos: ['Productos', 'Todo tu catálogo, organizado y siempre a la mano.'],
    categorias: ['Categorías', 'Dale orden a tu inventario con categorías claras.'],
    movimientos: ['Movimientos', 'Registra cada entrada y salida. Conserva el control de tus existencias.']
  };
  const state = {
    connected: false, busy: false, needsRefresh: false,
    categories: [], products: [], movements: [], productResults: [], movementResults: [],
    query: '', productFilter: '', updatedAt: null
  };
  // La credencial nunca se persiste ni se coloca en URLs o cuerpos de petición.
  let apiKey = '';
  let confirmation = null;
  const controllers = new Set();
  const modals = Object.fromEntries(['auth', 'product-edit', 'category-edit', 'detail', 'confirm']
    .map(name => [name, new bootstrap.Modal($(name + '-modal'))]));

  class ApiError extends Error {
    constructor(message, status = 0, uncertain = false) {
      super(message);
      this.status = status;
      this.uncertain = uncertain;
    }
  }

  function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('icon');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS(svg.namespaceURI, 'use');
    use.setAttribute('href', '#i-' + name);
    svg.append(use);
    return svg;
  }

  function message(text, kind = 'success', target = 'messages') {
    const alert = document.createElement('div');
    alert.className = `alert alert-${kind} alert-dismissible`;
    alert.setAttribute('role', kind === 'danger' ? 'alert' : 'status');
    const content = document.createElement('span');
    content.textContent = text;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'btn-close';
    close.setAttribute('data-bs-dismiss', 'alert');
    close.setAttribute('aria-label', 'Cerrar mensaje');
    alert.append(content, close);
    $(target).replaceChildren(alert);
  }

  function hideModal(name) {
    const element = $(name + '-modal');
    if (element.contains(document.activeElement)) document.activeElement.blur();
    modals[name].hide();
  }

  function clearSession() {
    apiKey = '';
    controllers.forEach(controller => controller.abort());
    state.connected = false;
    state.needsRefresh = false;
    state.categories = [];
    state.products = [];
    state.movements = [];
    state.productResults = [];
    state.movementResults = [];
    state.query = '';
    state.productFilter = '';
    state.updatedAt = null;
    confirmation = null;
    $('key').value = '';
    $('product-search').value = '';
    ['product-edit', 'category-edit', 'detail', 'confirm'].forEach(hideModal);
    ['product-form', 'category-form', 'movement-form', 'product-edit-form', 'category-edit-form'].forEach(resetForm);
    $('product-detail').replaceChildren();
    renderAll();
  }

  async function api(path, method = 'GET', body) {
    if (!apiKey) throw new ApiError('Introduce tu clave API para conectar al inventario.', 401);
    const controller = new AbortController();
    controllers.add(controller);
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch('/api' + path, {
        method,
        headers: { 'x-api-key': apiKey, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal,
        cache: 'no-store',
        credentials: 'same-origin'
      });
      if (response.status === 401) {
        clearSession();
        throw new ApiError('La clave API es incorrecta o ya no es válida. Vuelve a conectar con la clave configurada.', 401);
      }
      let data;
      try { data = await response.json(); }
      catch { throw new ApiError('El servidor devolvió una respuesta inesperada. Actualiza los datos antes de continuar.', response.status, method !== 'GET'); }
      if (!response.ok) {
        throw new ApiError(data.error || `No se pudo completar la solicitud (${response.status}).`, response.status, method !== 'GET' && response.status >= 500);
      }
      return data;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      if (method !== 'GET') {
        throw new ApiError('No se pudo confirmar si la operación se guardó. Actualiza los datos y revisa el historial antes de intentarla otra vez.', 0, true);
      }
      throw new ApiError('No se pudo consultar el inventario. Comprueba que el servidor esté disponible e inténtalo de nuevo.');
    } finally {
      clearTimeout(timeout);
      controllers.delete(controller);
    }
  }

  function updateControls() {
    const disabled = !state.connected || state.busy;
    const writesDisabled = disabled || state.needsRefresh;
    document.querySelectorAll('[data-write-controls]').forEach(fieldset => { fieldset.disabled = writesDisabled; });
    document.querySelectorAll('[data-api-action]').forEach(button => {
      button.disabled = disabled || (button.dataset.writeAction === 'true' && state.needsRefresh);
    });
    document.querySelectorAll('[data-movement-type]').forEach(button => { button.disabled = writesDisabled; });
    ['refresh-button', 'product-search', 'search-button', 'clear-search', 'movement-filter'].forEach(id => { $(id).disabled = disabled; });
    ['connect-button', 'disconnect-button', 'auth-submit', 'key'].forEach(id => { $(id).disabled = state.busy; });
    document.querySelectorAll('[data-open-auth], [data-bs-dismiss="modal"]').forEach(button => { button.disabled = state.busy; });
    $('product-submit').disabled = writesDisabled || state.categories.length === 0;
    $('movement-submit').disabled = writesDisabled || !state.products.some(p => p.activo);
    ['product-edit-submit', 'category-edit-submit', 'confirm-submit'].forEach(id => { $(id).disabled = writesDisabled; });
    $('loading').hidden = !state.busy;
    $('main-content').setAttribute('aria-busy', String(state.busy));
  }

  async function task(button, label, fn, feedback = 'messages') {
    if (state.busy) return;
    state.busy = true;
    const original = button ? [...button.childNodes] : null;
    if (button) {
      const spinner = document.createElement('span');
      spinner.className = 'spinner-border spinner-border-sm';
      spinner.setAttribute('aria-hidden', 'true');
      button.replaceChildren(spinner, document.createTextNode(label));
    }
    $('loading-label').textContent = label;
    updateControls();
    try { await fn(); }
    catch (err) {
      if (err.uncertain && state.connected) state.needsRefresh = true;
      message(err.message, 'danger', feedback);
      if (feedback !== 'messages') message(err.message, 'danger');
    } finally {
      state.busy = false;
      if (button) button.replaceChildren(...original);
      updateControls();
    }
  }

  function sortedMovements(rows) {
    return [...rows].sort((a, b) => (Date.parse(b.fecha) - Date.parse(a.fecha) || b.id - a.id));
  }

  async function load() {
    const q = state.query;
    const filter = state.productFilter;
    const [categories, products, movements, productResults, movementResults] = await Promise.all([
      api('/categorias'), api('/productos'), api('/movimientos'),
      q ? api('/productos?q=' + encodeURIComponent(q)) : Promise.resolve(null),
      filter ? api('/movimientos?producto_id=' + encodeURIComponent(filter)) : Promise.resolve(null)
    ]);
    state.categories = categories;
    state.products = products;
    state.movements = sortedMovements(movements);
    state.productResults = productResults || products;
    state.movementResults = sortedMovements(movementResults || movements);
    state.connected = true;
    state.needsRefresh = false;
    state.updatedAt = new Date();
    renderAll();
  }

  function empty(target, title, text, symbol = 'box') {
    ['tabindex', 'role', 'aria-label'].forEach(attribute => target.removeAttribute(attribute));
    const wrap = document.createElement('div');
    wrap.className = 'empty-state';
    const mark = document.createElement('span');
    mark.className = 'empty-icon';
    mark.append(icon(symbol));
    const heading = document.createElement('h3');
    heading.textContent = title;
    const paragraph = document.createElement('p');
    paragraph.textContent = text;
    wrap.append(mark, heading, paragraph);
    target.replaceChildren(wrap);
  }

  // Se conserva la construcción de tablas con nodos y textContent del cliente original.
  function table(target, headers, rows, caption) {
    target.tabIndex = 0;
    target.setAttribute('role', 'region');
    target.setAttribute('aria-label', caption);
    const t = document.createElement('table');
    t.className = 'table table-hover align-middle';
    const c = t.createCaption();
    c.textContent = caption;
    c.className = 'visually-hidden';
    const head = t.createTHead().insertRow();
    headers.forEach(header => {
      const th = document.createElement('th');
      th.scope = 'col';
      th.textContent = header;
      head.append(th);
    });
    const body = t.createTBody();
    rows.forEach(cells => {
      const row = body.insertRow();
      cells.forEach(({ value, cls = '' }) => {
        const td = row.insertCell();
        td.className = cls;
        if (value instanceof Node) td.append(value);
        else td.textContent = String(value ?? '');
      });
    });
    target.replaceChildren(t);
  }
  const cell = (value, cls = '') => ({ value, cls });

  function badge(text, kind) {
    const span = document.createElement('span');
    span.className = 'badge badge-' + kind;
    span.textContent = text;
    return span;
  }

  function dateCell(value) {
    const date = new Date(value);
    const time = document.createElement('time');
    if (!Number.isNaN(date.getTime())) {
      time.dateTime = value;
      time.textContent = dates.format(date);
      time.title = 'Horario local: ' + Intl.DateTimeFormat().resolvedOptions().timeZone;
    } else time.textContent = 'Fecha no disponible';
    return time;
  }

  function button(label, symbol, fn, { write = false, danger = false } = {}) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn-sm ' + (danger ? 'text-danger' : 'text-secondary');
    b.title = label;
    b.setAttribute('aria-label', label);
    b.dataset.apiAction = 'true';
    b.dataset.writeAction = String(write);
    b.append(icon(symbol));
    b.addEventListener('click', () => { if (!state.busy) fn(b); });
    return b;
  }

  function renderStats() {
    const active = state.products.filter(p => p.activo);
    const metrics = {
      'metric-products': active.length,
      'metric-categories': state.categories.length,
      'metric-units': active.reduce((sum, p) => sum + BigInt(p.stock), 0n),
      'metric-empty': active.filter(p => p.stock === 0).length
    };
    Object.entries(metrics).forEach(([id, value]) => { $(id).textContent = state.connected ? numbers.format(value) : '—'; });
    $('nav-product-count').textContent = state.connected ? numbers.format(active.length) : '—';
  }

  function renderProducts() {
    $('product-summary').textContent = state.connected
      ? `${numbers.format(state.products.length)} productos en el catálogo · ${numbers.format(state.products.filter(p => p.activo).length)} activos`
      : 'Conecta tu inventario para consultar el catálogo.';
    if (!state.connected) return empty($('products'), 'Tu catálogo, en un solo lugar', 'Introduce tu clave para consultar y administrar los productos.');
    if (!state.productResults.length) return empty($('products'), state.query ? 'Sin coincidencias' : 'Aún no hay productos', state.query ? 'Prueba con otro nombre o categoría, o limpia la búsqueda.' : 'Agrega una categoría y después tu primer producto.');
    table($('products'), ['ID', 'Nombre', 'Categoría', 'Precio (MXN)', 'Stock', 'Estado', 'Acciones'], state.productResults.map(p => {
      const actions = document.createElement('div');
      actions.className = 'row-actions';
      actions.append(button('Consultar detalle de ' + p.nombre, 'eye', b => showDetail(p.id, b)));
      if (p.activo) actions.append(
        button('Editar ' + p.nombre, 'edit', () => editProduct(p), { write: true }),
        button('Desactivar ' + p.nombre, 'trash', () => confirmAction('product', p), { write: true, danger: true })
      );
      return [cell(p.id, 'id-cell'), cell(p.nombre, 'primary-cell'), cell(p.categoria), cell(money.format(p.precio), 'number-cell'), cell(numbers.format(p.stock), 'number-cell' + (p.stock === 0 ? ' stock-zero' : '')), cell(badge(p.activo ? 'Activo' : 'Inactivo', p.activo ? 'active' : 'inactive')), cell(actions, 'actions-cell')];
    }), 'Catálogo de productos y acciones disponibles');
  }

  function renderCategories() {
    $('category-summary').textContent = state.connected ? `${numbers.format(state.categories.length)} categorías para organizar tu inventario.` : 'Organiza los productos de tu inventario.';
    if (!state.connected) return empty($('categories'), 'Todo empieza con una categoría', 'Conecta tu inventario para consultar las categorías.', 'tag');
    if (!state.categories.length) return empty($('categories'), 'Aún no hay categorías', 'Usa el formulario para crear la primera categoría.', 'tag');
    table($('categories'), ['ID', 'Nombre', 'Descripción', 'Acciones'], state.categories.map(c => {
      const actions = document.createElement('div');
      actions.className = 'row-actions';
      actions.append(button('Editar ' + c.nombre, 'edit', () => editCategory(c), { write: true }), button('Eliminar ' + c.nombre, 'trash', () => confirmAction('category', c), { write: true, danger: true }));
      return [cell(c.id, 'id-cell'), cell(c.nombre, 'primary-cell'), cell(c.descripcion || 'Sin descripción', 'description-cell'), cell(actions, 'actions-cell')];
    }), 'Categorías del inventario');
  }

  function movementCells(m, compact) {
    const entry = m.tipo === 'ENTRADA';
    const cells = [cell(m.producto, 'primary-cell'), cell(badge(entry ? 'Entrada' : 'Salida', entry ? 'entry' : 'exit')), cell((entry ? '+' : '−') + numbers.format(m.cantidad), 'number-cell'), cell(dateCell(m.fecha), 'date-cell')];
    return compact ? cells : [cell(m.id, 'id-cell'), ...cells, cell(m.nota || '—', 'description-cell')];
  }

  function renderMovements() {
    for (const [id, rows, compact] of [['recent-movements', state.movements.slice(0, 6), true], ['movements', state.movementResults, false]]) {
      if (!state.connected) empty($(id), 'Cada movimiento cuenta', 'Conecta tu inventario para ver las entradas y salidas.', 'move');
      else if (!rows.length) empty($(id), 'Sin movimientos registrados', id === 'movements' && state.productFilter ? 'Este producto todavía no tiene movimientos.' : 'Las entradas y salidas que registres aparecerán aquí.', 'move');
      else table($(id), compact ? ['Producto', 'Tipo', 'Cantidad', 'Fecha local'] : ['ID', 'Producto', 'Tipo', 'Cantidad', 'Fecha local', 'Nota'], rows.map(m => movementCells(m, compact)), compact ? 'Últimos seis movimientos' : 'Historial de movimientos, del más reciente al más antiguo');
    }
  }

  function options(select, rows, placeholder, label) {
    const selected = select.value;
    select.replaceChildren(new Option(placeholder, ''));
    rows.forEach(row => select.add(new Option(label(row), row.id)));
    if (rows.some(row => String(row.id) === selected)) select.value = selected;
  }

  function renderSelectors() {
    ['product-category', 'product-edit-category'].forEach(id => options($(id), state.categories, state.categories.length ? 'Selecciona una categoría' : 'No hay categorías disponibles', c => c.nombre));
    options($('movement-product'), state.products.filter(p => p.activo), 'Selecciona un producto', p => p.nombre);
    options($('movement-filter'), state.products, 'Todos los productos', p => p.nombre + (p.activo ? '' : ' (inactivo)'));
    $('movement-filter').value = state.productFilter;
    $('product-category-help').textContent = state.categories.length ? 'Selecciona la categoría del producto.' : 'Agrega primero una categoría en la sección Categorías.';
    updateStockInfo();
  }

  function updateStockInfo() {
    const product = state.products.find(p => String(p.id) === $('movement-product').value);
    const out = $('movement-type').value === 'SALIDA';
    $('movement-quantity').setCustomValidity('');
    $('stock-info').classList.toggle('warning', !!product && out && product.stock === 0);
    $('stock-info').textContent = product
      ? `Stock disponible: ${numbers.format(product.stock)} ${product.stock === 1 ? 'unidad' : 'unidades'}. ${out ? 'La salida no puede superar esta cantidad.' : 'La entrada se sumará a las existencias.'}`
      : 'Selecciona un producto para consultar su stock.';
    $('movement-quantity').max = product && out ? String(product.stock) : '9007199254740991';
  }

  function renderAll() {
    renderStats();
    renderProducts();
    renderCategories();
    renderMovements();
    renderSelectors();
    $('connect-banner').hidden = state.connected;
    $('connection-status').classList.toggle('connected', state.connected);
    const dot = document.createElement('span');
    dot.className = 'status-dot';
    $('connection-status').replaceChildren(dot, document.createTextNode(state.connected ? 'Conectado' : 'Sin conexión'));
    $('connect-label').textContent = state.connected ? 'Cambiar clave' : 'Conectar';
    $('connect-button').setAttribute('aria-label', state.connected ? 'Cambiar clave de acceso' : 'Conectar al inventario');
    $('connect-button').title = state.connected ? 'Cambiar clave' : 'Conectar';
    $('disconnect-button').hidden = !state.connected;
    $('last-updated').textContent = state.updatedAt ? 'Actualizado: ' + dates.format(state.updatedAt) : 'Sin datos consultados';
    updateControls();
  }

  function navigate(name, focus = true) {
    if (!views[name]) name = 'dashboard';
    document.querySelectorAll('.view').forEach(view => { view.hidden = view.id !== 'view-' + name; });
    document.querySelectorAll('[data-view]').forEach(link => {
      const active = link.dataset.view === name;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    $('page-title').textContent = views[name][0];
    $('page-description').textContent = views[name][1];
    $('breadcrumb-current').textContent = views[name][0];
    document.title = views[name][0] + ' | Inventario Seguro';
    bootstrap.Offcanvas.getInstance($('sidebar'))?.hide();
    if (focus) $('page-title').focus({ preventScroll: true });
  }

  function go(name) {
    if (location.hash === '#' + name) navigate(name);
    else location.hash = name;
  }

  function resetForm(id) {
    const form = $(id);
    form.reset();
    form.classList.remove('was-validated');
    form.querySelectorAll('input, select, textarea').forEach(input => input.setCustomValidity(''));
  }

  function validate(form) {
    form.querySelectorAll('input, select, textarea').forEach(input => input.setCustomValidity(''));
    const name = form.elements.namedItem('nombre');
    if (name && !name.value.trim()) name.setCustomValidity('Escribe un nombre que no contenga solo espacios.');
    const price = form.elements.namedItem('precio');
    if (price) {
      const value = Number(price.value);
      const cents = value * 100;
      if (!price.value || !Number.isFinite(value) || value < 0 || value > 1e9 || Math.abs(cents - Math.round(cents)) > Number.EPSILON * Math.abs(cents) * 2) {
        price.setCustomValidity('Escribe un precio válido con hasta dos decimales.');
      }
    }
    const quantity = form.elements.namedItem('cantidad');
    if (quantity && (!Number.isSafeInteger(Number(quantity.value)) || Number(quantity.value) <= 0)) quantity.setCustomValidity('La cantidad debe ser un entero positivo.');
    form.classList.add('was-validated');
    if (!form.checkValidity()) { form.reportValidity(); return false; }
    return true;
  }

  async function write({ operation, success, form, modal }) {
    await operation();
    if (form) resetForm(form);
    if (modal) hideModal(modal);
    message(success);
    try { await load(); }
    catch (err) {
      if (state.connected) state.needsRefresh = true;
      message('La operación se guardó, pero no fue posible actualizar la vista. No repitas el registro; pulsa Actualizar datos para consultar el resultado.' + (err.status === 401 ? ' Vuelve a conectar con tu clave.' : ''), 'warning');
    }
  }

  function editProduct(product) {
    if (state.needsRefresh) return;
    resetForm('product-edit-form');
    $('product-edit-messages').replaceChildren();
    $('product-edit-id').value = product.id;
    $('product-edit-name').value = product.nombre;
    $('product-edit-category').value = product.categoria_id;
    $('product-edit-price').value = product.precio;
    modals['product-edit'].show();
  }

  function editCategory(category) {
    if (state.needsRefresh) return;
    resetForm('category-edit-form');
    $('category-edit-messages').replaceChildren();
    $('category-edit-id').value = category.id;
    $('category-edit-name').value = category.nombre;
    $('category-edit-description').value = category.descripcion;
    modals['category-edit'].show();
  }

  function showDetail(id, trigger) {
    return task(trigger, 'Consultando…', async () => {
      const p = await api('/productos/' + id);
      const name = document.createElement('h3');
      name.className = 'detail-name';
      name.textContent = p.nombre;
      const list = document.createElement('dl');
      list.className = 'detail-list';
      const category = state.categories.find(c => c.id === p.categoria_id);
      for (const [label, value] of [['ID', p.id], ['Categoría', category?.nombre || 'Categoría #' + p.categoria_id], ['Precio (MXN)', money.format(p.precio)], ['Stock', numbers.format(p.stock) + ' unidades'], ['Estado', badge(p.activo ? 'Activo' : 'Inactivo', p.activo ? 'active' : 'inactive')]]) {
        const group = document.createElement('div');
        const dt = document.createElement('dt');
        const dd = document.createElement('dd');
        dt.textContent = label;
        if (value instanceof Node) dd.append(value);
        else dd.textContent = String(value);
        group.append(dt, dd);
        list.append(group);
      }
      $('product-detail').replaceChildren(name, list);
      modals.detail.show();
    });
  }

  function confirmAction(type, row) {
    if (state.needsRefresh) return;
    confirmation = { type, id: row.id };
    $('confirm-messages').replaceChildren();
    const product = type === 'product';
    $('confirm-title').textContent = product ? 'Desactivar producto' : 'Eliminar categoría';
    $('confirm-submit').textContent = product ? 'Desactivar producto' : 'Eliminar categoría';
    $('confirm-description').textContent = product
      ? `¿Desactivar “${row.nombre}”? Se conservarán sus existencias e historial, pero no podrás registrar nuevos movimientos para este producto.`
      : `¿Eliminar la categoría “${row.nombre}”? Solo puede eliminarse si no tiene productos asociados, incluidos los inactivos.`;
    modals.confirm.show();
  }

  function bindForm(id, buttonId, operation, success, modal) {
    $(id).addEventListener('submit', event => {
      event.preventDefault();
      if (state.busy || !state.connected || state.needsRefresh || !validate(event.target)) return;
      const data = Object.fromEntries(new FormData(event.target));
      task($(buttonId), 'Guardando…', () => write({
        operation: () => operation(data), success, form: id, modal
      }), modal ? modal + '-messages' : 'messages');
    });
  }

  bindForm('category-form', 'category-submit', data => api('/categorias', 'POST', { nombre: data.nombre.trim(), descripcion: data.descripcion.trim() }), 'Categoría creada correctamente.');
  bindForm('category-edit-form', 'category-edit-submit', data => api('/categorias/' + $('category-edit-id').value, 'PUT', { nombre: data.nombre.trim(), descripcion: data.descripcion.trim() }), 'Categoría actualizada correctamente.', 'category-edit');
  const productBody = data => ({ nombre: data.nombre.trim(), categoria_id: Number(data.categoria_id), precio: Number(data.precio) });
  bindForm('product-form', 'product-submit', data => api('/productos', 'POST', productBody(data)), 'Producto creado. Registra una entrada para agregar existencias.');
  bindForm('product-edit-form', 'product-edit-submit', data => api('/productos/' + $('product-edit-id').value, 'PUT', productBody(data)), 'Producto actualizado correctamente.', 'product-edit');

  $('movement-form').addEventListener('submit', event => {
    event.preventDefault();
    if (state.busy || !state.connected || state.needsRefresh || !validate(event.target)) return;
    const body = {
      producto_id: Number($('movement-product').value), tipo: $('movement-type').value,
      cantidad: Number($('movement-quantity').value), nota: $('movement-note').value.trim()
    };
    task($('movement-submit'), 'Registrando…', async () => {
      // Actualiza la consulta previa; el servidor conserva la validación atómica final.
      const product = await api('/productos/' + body.producto_id);
      const cached = state.products.find(p => p.id === product.id);
      if (cached) Object.assign(cached, product);
      updateStockInfo();
      renderStats();
      if (!product.activo) throw new ApiError('Este producto está inactivo. Actualiza los datos y selecciona otro producto.', 409);
      if (body.tipo === 'SALIDA' && body.cantidad > product.stock) {
        throw new ApiError(`Existencias insuficientes: hay ${numbers.format(product.stock)} unidades disponibles. Ajusta la cantidad de salida.`, 409);
      }
      await write({ operation: () => api('/movimientos', 'POST', body), success: body.tipo === 'ENTRADA' ? 'Entrada registrada. Las existencias se actualizaron correctamente.' : 'Salida registrada. Las existencias se actualizaron correctamente.', form: 'movement-form' });
    });
  });

  $('confirm-submit').addEventListener('click', () => {
    if (!confirmation || state.busy || !state.connected || state.needsRefresh) return;
    const { type, id } = confirmation;
    task($('confirm-submit'), 'Procesando…', async () => {
      try {
        await write({ operation: () => api((type === 'product' ? '/productos/' : '/categorias/') + id, 'DELETE'), success: type === 'product' ? 'Producto desactivado. Su historial y sus existencias se conservan.' : 'Categoría eliminada correctamente.', modal: 'confirm' });
        confirmation = null;
      } catch (err) {
        if (type === 'category' && err.status === 409) err.message = 'No se puede eliminar esta categoría porque tiene productos asociados. Los productos inactivos también cuentan.';
        throw err;
      }
    }, 'confirm-messages');
  });

  function openAuth() {
    $('auth-messages').replaceChildren();
    resetForm('auth-form');
    modals.auth.show();
  }
  $('connect-button').addEventListener('click', openAuth);
  document.querySelectorAll('[data-open-auth]').forEach(button => button.addEventListener('click', openAuth));
  $('auth-modal').addEventListener('shown.bs.modal', () => $('key').focus());
  $('auth-modal').addEventListener('hidden.bs.modal', () => { $('key').value = ''; });
  ['product-edit', 'category-edit'].forEach(name => $(name + '-modal').addEventListener('shown.bs.modal', () => $(name + '-name').focus()));
  $('auth-form').addEventListener('submit', event => {
    event.preventDefault();
    if (state.busy || !validate(event.target)) return;
    const supplied = $('key').value;
    clearSession();
    apiKey = supplied;
    task($('auth-submit'), 'Conectando…', async () => {
      await load();
      resetForm('auth-form');
      hideModal('auth');
      message('Inventario conectado. Los datos están actualizados.');
    }, 'auth-messages');
  });
  $('disconnect-button').addEventListener('click', () => {
    clearSession();
    message('Sesión desconectada. La clave se eliminó de la memoria de esta página.', 'info');
  });
  $('refresh-button').addEventListener('click', () => task($('refresh-button'), 'Actualizando…', async () => { await load(); message('Inventario actualizado.'); }));
  $('search-form').addEventListener('submit', event => {
    event.preventDefault();
    if (state.busy || !state.connected) return;
    task($('search-button'), 'Buscando…', async () => {
      const query = $('product-search').value.trim();
      const rows = await api('/productos' + (query ? '?q=' + encodeURIComponent(query) : ''));
      state.query = query;
      state.productResults = rows;
      renderProducts();
    });
  });
  $('clear-search').addEventListener('click', () => {
    $('product-search').value = '';
    $('search-form').requestSubmit();
  });
  $('movement-filter').addEventListener('change', () => {
    const selected = $('movement-filter').value;
    task(null, 'Filtrando historial…', async () => {
      try {
        const rows = await api('/movimientos' + (selected ? '?producto_id=' + encodeURIComponent(selected) : ''));
        state.productFilter = selected;
        state.movementResults = sortedMovements(rows);
        renderMovements();
      } catch (err) {
        $('movement-filter').value = state.productFilter;
        throw err;
      }
    });
  });
  ['movement-product', 'movement-type'].forEach(id => $(id).addEventListener('change', updateStockInfo));
  document.querySelectorAll('form input, form select, form textarea').forEach(input => input.addEventListener('input', () => input.setCustomValidity('')));
  document.querySelectorAll('[data-go]').forEach(button => button.addEventListener('click', () => go(button.dataset.go)));
  document.querySelectorAll('[data-movement-type]').forEach(button => button.addEventListener('click', () => {
    go('movimientos');
    $('movement-type').value = button.dataset.movementType;
    updateStockInfo();
    $('movement-product').focus();
  }));
  window.addEventListener('hashchange', () => navigate(location.hash.slice(1)));
  window.addEventListener('pagehide', clearSession);
  $('today-label').textContent = new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  renderAll();
  navigate(location.hash.slice(1), false);
})();
