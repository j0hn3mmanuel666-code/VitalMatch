(function () {
  'use strict';
  document.querySelectorAll('[data-workspace-pagination]').forEach(function (navigation) {
    navigation.querySelectorAll('[data-page-offset]').forEach(function (link) {
      var url = new URL(window.location.href);
      url.searchParams.set(navigation.dataset.pageParam || 'page', Number(navigation.dataset.page || 1) + Number(link.dataset.pageOffset));
      link.href = url.pathname + url.search;
    });
  });
})();
