/**
 * 知识配置平台 - 公共脚本（全平台唯一一份）
 *
 * 集中提供以下公共能力，页面只负责调用，不再各自实现：
 *   1. 登录守卫：未登录访问业务页跳登录页；已登录访问登录页跳首页
 *   2. 应用外壳：侧边栏、顶栏统一注入，页面 HTML 只保留内容区
 *   3. 导航高亮：依据当前 URL 计算，不再由各页面硬编码
 *   4. 顶部用户区与退出确认
 *   5. Toast 提示（单例，连续提示不叠加、不残留；纯 DOM，刷新后不会重现）
 *   6. Confirm 确认框（取消 / 点遮罩仅关闭，页面保持原样）
 *
 * 依赖：js/mock.js（AuthModule）先行加载。本脚本固定在 body 末尾、
 * 业务页面脚本之前同步加载，加载顺序见各 HTML。
 */
(function () {
  'use strict';

  var LOGIN_PAGE = 'login.html';
  var HOME_PAGE = 'index.html';

  function getCurrentPage() {
    return window.location.pathname.split('/').pop() || HOME_PAGE;
  }

  var currentPage = getCurrentPage();
  var isLoginPage = currentPage === LOGIN_PAGE;

  // ====================== 1. 登录守卫（跳转规则只此一处）======================
  var loggedIn = (typeof AuthModule !== 'undefined') && AuthModule.isLoggedIn();

  if (!isLoginPage && !loggedIn) {
    // 未登录访问业务页：跳转登录页（后续逻辑与页面脚本的行为沿用历史现状）
    window.location.href = LOGIN_PAGE;
    return;
  }
  if (isLoginPage && loggedIn) {
    // 已登录访问登录页：直接进入首页
    window.location.href = HOME_PAGE;
    return;
  }

  // ====================== 2 & 3. 应用外壳 + 导航高亮 ======================
  // 侧边栏配置只维护这一份；新增菜单改这里即可，各页面无需同步
  var NAV_ITEMS = [
    { href: 'index.html', icon: 'lucide:layout-dashboard', label: '概览' },
    { href: 'merchant.html', icon: 'lucide:store', label: '商家知识' },
    { href: 'merchant-set.html', icon: 'lucide:layers', label: '商家集合知识' },
    { href: 'industry.html', icon: 'lucide:briefcase', label: '行业知识' },
    { href: 'global.html', icon: 'lucide:globe', label: '通用知识' }
  ];

  /** 依据当前 URL 渲染侧边栏（含高亮）并注入顶栏；页面只提供 #app > main 结构 */
  function renderShell() {
    if (isLoginPage) return;

    var app = document.getElementById('app');
    var main = app ? app.querySelector('main') : null;
    if (!app || !main) return;

    var currentKey = currentPage.replace(/\.html$/, '') || 'index';
    var navHtml = NAV_ITEMS.map(function (item) {
      var active = (item.href.replace(/\.html$/, '') || 'index') === currentKey ? ' router-active' : '';
      return '<a href="' + item.href + '" class="nav-item' + active + '">' +
        '<span class="iconify nav-item-icon" data-icon="' + item.icon + '" data-width="18" data-height="18"></span>' +
        item.label +
      '</a>';
    }).join('');

    var aside = document.createElement('aside');
    aside.className = 'app-sidebar';
    aside.innerHTML =
      '<div class="sidebar-logo">' +
        '<div class="sidebar-logo-icon flex items-center justify-center">' +
          '<span class="iconify" data-icon="lucide:book-open" data-width="20" data-height="20"></span>' +
        '</div>' +
        '<span class="sidebar-logo-text">知识配置平台</span>' +
      '</div>' +
      '<nav class="sidebar-nav">' + navHtml + '</nav>';
    app.insertBefore(aside, main);

    var header = document.createElement('header');
    header.className = 'app-header border-b border-slate-200';
    header.innerHTML =
      '<span class="app-header-title text-slate-700 font-medium">知识配置平台</span>';
    main.insertBefore(header, main.firstChild);

    return header;
  }

  // ====================== 4. 顶部用户区与退出 ======================
  function initUserHeader(header) {
    if (!header || typeof AuthModule === 'undefined') return;

    var user = AuthModule.getCurrentUser();
    if (!user) return;
    if (header.querySelector('.user-info')) return;

    var userInfo = document.createElement('div');
    userInfo.className = 'user-info ml-auto flex items-center gap-3';
    userInfo.innerHTML =
      '<span class="text-sm text-slate-500">欢迎，<span class="font-medium text-slate-700">' +
        (user.name || user.username) +
      '</span></span>' +
      '<button type="button" id="logoutBtn" class="logout-btn inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors">' +
        '<span class="iconify" data-icon="lucide:log-out" data-width="16" data-height="16"></span>' +
        '退出' +
      '</button>';
    header.appendChild(userInfo);

    // 退出需确认；取消（或点遮罩）不执行回调，用户留在原页面
    var logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', function () {
        Confirm.show('确定要退出登录吗？', function () {
          AuthModule.logout();
          Toast.show('已退出登录', 'success');
          setTimeout(function () {
            window.location.href = LOGIN_PAGE;
          }, 500);
        });
      });
    }
  }

  // ====================== 5. Toast（单例）======================
  /** 容器与当前提示均为单例，整个页面生命周期内只创建一次 / 只保留一条 */
  var toastContainer = null;
  var currentToast = null; // { el, timer }

  function getToastContainer() {
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.id = 'knowledge-platform-toast';
      toastContainer.className = 'toast-container';
      document.body.appendChild(toastContainer);
    }
    return toastContainer;
  }

  /**
   * 展示提示消息（替代 alert）
   * @param {string} msg - 文案
   * @param {string} type - 'error' | 'success' | 'info'
   *
   * 说明：提示仅存在于 DOM，不写入任何存储，因此刷新页面后不会重复出现；
   * 连续调用时新提示会替换旧提示（含其定时器），不会叠加或残留。
   */
  window.Toast = {
    show: function (msg, type) {
      type = type || 'info';
      var container = getToastContainer();

      if (currentToast) {
        clearTimeout(currentToast.timer);
        if (currentToast.el.parentNode) currentToast.el.parentNode.removeChild(currentToast.el);
        currentToast = null;
      }

      var item = document.createElement('div');
      item.className = 'toast-item toast-' + type;
      item.textContent = msg;
      container.appendChild(item);

      var toast = { el: item, timer: null };
      toast.timer = setTimeout(function () {
        if (item.parentNode) item.parentNode.removeChild(item);
        if (currentToast === toast) currentToast = null;
      }, 2800);
      currentToast = toast;
    }
  };

  // ====================== 6. Confirm 确认框 ======================
  /**
   * 确认框（替代 confirm）
   * @param {string} msg - 提示文案
   * @param {function} onConfirm - 点击确定回调
   * @param {function} [onCancel] - 点击取消 / 遮罩回调（可选）；不提供则仅关闭，页面无变化
   */
  window.Confirm = {
    show: function (msg, onConfirm, onCancel) {
      var overlay = document.createElement('div');
      overlay.className = 'confirm-overlay';
      var title = document.createElement('div');
      title.className = 'confirm-title text-obsidian';
      title.textContent = msg || '确定执行？';
      var actions = document.createElement('div');
      actions.className = 'confirm-actions';
      var btnCancel = document.createElement('button');
      btnCancel.type = 'button';
      btnCancel.className = 'btn-secondary confirm-cancel';
      btnCancel.textContent = '取消';
      var btnOk = document.createElement('button');
      btnOk.type = 'button';
      btnOk.className = 'btn-primary confirm-ok';
      btnOk.textContent = '确定';
      actions.appendChild(btnCancel);
      actions.appendChild(btnOk);
      var box = document.createElement('div');
      box.className = 'confirm-box premium-card';
      box.appendChild(title);
      box.appendChild(actions);
      overlay.appendChild(box);
      function close() {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }
      btnOk.addEventListener('click', function () {
        close();
        if (typeof onConfirm === 'function') onConfirm();
      });
      btnCancel.addEventListener('click', function () {
        close();
        if (typeof onCancel === 'function') onCancel();
      });
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) {
          close();
          if (typeof onCancel === 'function') onCancel();
        }
      });
      document.body.appendChild(overlay);
    }
  };

  // ====================== 启动（脚本位于 body 末尾，DOM 已解析）======================
  var shellHeader = renderShell();
  initUserHeader(shellHeader);
})();
