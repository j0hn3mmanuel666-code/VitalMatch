/* Development-only browser refresh; the server omits this script in production. */
(function () {
  'use strict';
  if (!('EventSource' in window)) return;

  var source = new EventSource('/__dev/events');
  var currentRevision = '';

  source.addEventListener('ready', function (event) {
    if (currentRevision && currentRevision !== event.data) {
      window.location.reload();
      return;
    }
    currentRevision = event.data;
  });

  source.addEventListener('reload', function () {
    window.location.reload();
  });
})();
