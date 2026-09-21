/**
 * 知识配置平台 - 公共脚本（公共能力唯一入口）
 *
 * 各页面只负责调用，不在页面内重复实现以下能力：
 * - 登录检查：非登录页未登录跳登录页；登录页已登录跳首页
 * - 导航高亮：依据当前 URL 给对应 .nav-item 加 .router-active
 * - 顶部用户区：欢迎信息与退出按钮（退出需确认，取消/点遮罩留在原页）
 * - Toast：同一时刻只显示一条，新提示替换旧提示，不叠加、不残留
 * - Flash：跨页一次性提示（sessionStorage 存、取后即删），刷新不重复
 * - Confirm：统一确认框，同时只存在一个
 */
(function () {
  'use strict';

  var LOGIN_PAGE = 'login.html';
  var FLASH_KEY = 'knowledge_platform_flash_toast';
  var TOAST_DURATION = 2800;

  var currentPage = window.location.pathname.split('/').pop() || 'index.html';
  var isLoginPage = currentPage === LOGIN_PAGE;

  function isLoggedIn() {
    return typeof AuthModule !== 'undefined' && !!AuthModule && AuthModule.isLoggedIn();
  }

  // ====================== Toast 提示消息 ======================
  var toastContainer = null;
  var currentToast = null;
  var toastTimer = null;

  function getToastContainer() {
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.id = 'knowledge-platform-toast';
      toastContainer.className = 'toast-container';
      document.body.appendChild(toastContainer);
    }
    return toastContainer;
  }

  /** 立刻移除当前提示并清掉定时器，保证连续提示不叠加、不残留 */
  function hideToast() {
    if (toastTimer) {
      clearTimeout(toastTimer);
      toastTimer = null;
    }
    if (currentToast) {
      if (currentToast.parentNode) currentToast.parentNode.removeChild(currentToast);
      currentToast = null;
    }
  }

  window.Toast = {
    /**
     * 展示提示消息（替代 alert）
     * @param {string} msg - 文案
     * @param {string} type - 'error' | 'success' | 'info'
     */
    show: function (msg, type) {
      type = type || 'info';
      hideToast();

      var item = document.createElement('div');
      item.className = 'toast-item toast-' + type;
      item.textContent = msg;
      getToastContainer().appendChild(item);

      currentToast = item;
      toastTimer = setTimeout(hideToast, TOAST_DURATION);
    },

    /**
     * 存入一条跨页提示（如下一页加载后展示）。
     * 存于 sessionStorage，消费一次即删除，刷新不会重复出现。
     */
    flash: function (msg, type) {
      try {
        sessionStorage.setItem(FLASH_KEY, JSON.stringify({ msg: msg, type: type || 'info' }));
      } catch (_) {}
    },

    /** 读取并清空跨页提示后展示；无提示时不做任何事 */
    consumeFlash: function () {
      var data = null;
      try {
        var raw = sessionStorage.getItem(FLASH_KEY);
        sessionStorage.removeItem(FLASH_KEY); // 先删除，保证刷新不重复
        data = raw ? JSON.parse(raw) : null;
      } catch (_) {
        data = null;
      }
      if (data && data.msg) this.show(data.msg, data.type);
    }
  };

  // ====================== Confirm 确认框 ======================
  var confirmOpen = false;

  /**
   * 确认框（替代 confirm），同时只允许存在一个
   * @param {string} msg - 提示文案
   * @param {function} onConfirm - 点击确定回调
   * @param {function} [onCancel] - 点击取消/遮罩回调（可选）
   */
  window.Confirm = {
    show: function (msg, onConfirm, onCancel) {
      if (confirmOpen) return;
      confirmOpen = true;

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
        confirmOpen = false;
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }
      btnOk.addEventListener('click', function () {
        close();
        if (typeof onConfirm === 'function') onConfirm();
      });
      // 取消与点击遮罩：仅关闭，不执行 onConfirm，页面保持原样
      function handleCancel() {
        close();
        if (typeof onCancel === 'function') onCancel();
      }
      btnCancel.addEventListener('click', handleCancel);
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) handleCancel();
      });

      document.body.appendChild(overlay);
    }
  };

  // ====================== 登录检查 ======================
  // 在脚本解析到此处时立即跳转，与原先各页面自行跳转的时机保持一致
  var redirecting = false;
  if (isLoginPage) {
    if (isLoggedIn()) {
      window.location.href = 'index.html';
      redirecting = true;
    }
  } else if (!isLoggedIn()) {
    window.location.href = LOGIN_PAGE;
    redirecting = true;
  }

  // ====================== 导航高亮（唯一实现，HTML 不再硬编码）======================
  (function highlightNav() {
    var path = currentPage.replace(/\.html$/, '') || 'index';
    document.querySelectorAll('.nav-item').forEach(function (el) {
      var href = (el.getAttribute('href') || '').replace(/\.html$/, '') || 'index';
      if (href === path) el.classList.add('router-active');
      else el.classList.remove('router-active');
    });
  })();

  // ====================== 顶部用户信息与退出 ======================
  function initUserHeader() {
    if (typeof AuthModule === 'undefined') return;

    var user = AuthModule.getCurrentUser();
    if (!user) return;

    var header = document.querySelector('.app-header');
    if (!header || header.querySelector('.user-info')) return;

    var userInfo = document.createElement('div');
    userInfo.className = 'user-info ml-auto flex items-center gap-3';
    userInfo.innerHTML =
      '<span class="text-sm text-slate-500">欢迎，<span class="font-medium text-slate-700">' + (user.name || user.username) + '</span></span>' +
      '<button type="button" id="logoutBtn" class="logout-btn inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors">' +
        '<span class="iconify" data-icon="lucide:log-out" data-width="16" data-height="16"></span>' +
        '退出' +
      '</button>';
    header.appendChild(userInfo);

    document.getElementById('logoutBtn').addEventListener('click', function () {
      Confirm.show('确定要退出登录吗？', function () {
        AuthModule.logout();
        // 通过一次性 Flash 在登录页提示，立即跳转也不会丢；刷新登录页不重复
        Toast.flash('已退出登录', 'success');
        window.location.href = LOGIN_PAGE;
      });
      // 未传 onCancel：取消或点击遮罩仅关闭确认框，留在当前页面
    });
  }

  // ====================== 统一初始化 ======================
  function init() {
    if (redirecting) return;
    if (isLoginPage) {
      Toast.consumeFlash();
      return;
    }
    initUserHeader();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
