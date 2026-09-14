(() => {
  'use strict';

  const VERSION = '1.6.70';
  const current = document.currentScript;
  const base = current?.src || document.baseURI;

  function load(filename, marker, errorMessage) {
    if (document.querySelector(`script[${marker}]`)) return;
    const script = document.createElement('script');
    script.src = new URL(`${filename}?v=${VERSION}`, base).href;
    script.setAttribute(marker, VERSION);
    script.onerror = () => console.error(errorMessage);
    document.body.appendChild(script);
  }

  function installMobileTabletFit() {
    const mobileHost = (() => {
      try {
        if (window.parent !== window && window.parent.document.querySelector('.mobile-controls')) return true;
      } catch (_) {}
      try { return matchMedia('(max-width:720px),(pointer:coarse)').matches; } catch (_) { return innerWidth <= 720; }
    })();
    if (!mobileHost || document.getElementById('ptbo-mobile-tablet-fit-style')) return;

    const style = document.createElement('style');
    style.id = 'ptbo-mobile-tablet-fit-style';
    style.textContent = `
      html.ptbo-mobile-tablet-fit #ptbo-response-tablet-overlay{
        box-sizing:border-box!important;
        inset:0!important;
        width:100%!important;
        max-width:100vw!important;
        height:var(--ptbo-tablet-visual-height,100dvh)!important;
        max-height:100dvh!important;
        min-height:0!important;
        place-items:stretch!important;
        overflow:hidden!important;
        padding:max(4px,env(safe-area-inset-top)) max(4px,env(safe-area-inset-right)) max(4px,env(safe-area-inset-bottom)) max(4px,env(safe-area-inset-left))!important;
      }
      html.ptbo-mobile-tablet-fit #ptbo-response-tablet{
        box-sizing:border-box!important;
        width:100%!important;
        max-width:100%!important;
        min-width:0!important;
        height:100%!important;
        max-height:100%!important;
        min-height:0!important;
        margin:0!important;
        border-width:4px!important;
        border-radius:15px!important;
        grid-template-rows:auto minmax(0,1fr) auto!important;
      }
      html.ptbo-mobile-tablet-fit #ptbo-response-tablet .tablet-topbar{
        box-sizing:border-box!important;
        min-width:0!important;
        padding:8px 9px 8px 10px!important;
        gap:7px!important;
      }
      html.ptbo-mobile-tablet-fit #ptbo-response-tablet .tablet-icon{display:none!important}
      html.ptbo-mobile-tablet-fit #ptbo-response-tablet .tablet-heading{min-width:0!important}
      html.ptbo-mobile-tablet-fit #ptbo-response-tablet .tablet-kicker{font-size:8px!important;line-height:1.1!important}
      html.ptbo-mobile-tablet-fit #ptbo-response-tablet .tablet-title{font-size:14px!important;line-height:1.15!important}
      html.ptbo-mobile-tablet-fit #ptbo-response-tablet .tablet-address{font-size:9.5px!important;line-height:1.2!important}
      html.ptbo-mobile-tablet-fit #ptbo-tablet-close{
        box-sizing:border-box!important;
        width:38px!important;
        height:38px!important;
        min-width:38px!important;
        min-height:38px!important;
        border-radius:10px!important;
        font-size:22px!important;
      }
      html.ptbo-mobile-tablet-fit #ptbo-response-tablet-map-wrap{
        min-width:0!important;
        min-height:0!important;
        overflow:hidden!important;
      }
      html.ptbo-mobile-tablet-fit #ptbo-response-tablet-map{inset:0!important;min-width:0!important;min-height:0!important}
      html.ptbo-mobile-tablet-fit #ptbo-tablet-map-status{
        left:7px!important;
        top:7px!important;
        max-width:calc(100% - 54px)!important;
        padding:6px 8px!important;
        font-size:9px!important;
        line-height:1.25!important;
      }
      html.ptbo-mobile-tablet-fit #ptbo-response-tablet .tablet-footer{
        box-sizing:border-box!important;
        display:block!important;
        min-width:0!important;
        padding:6px!important;
      }
      html.ptbo-mobile-tablet-fit #ptbo-response-tablet .tablet-help{display:none!important}
      html.ptbo-mobile-tablet-fit #ptbo-response-tablet .tablet-actions{
        display:grid!important;
        grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important;
        gap:6px!important;
        width:100%!important;
        min-width:0!important;
        margin:0!important;
      }
      html.ptbo-mobile-tablet-fit #ptbo-response-tablet .tablet-btn{
        box-sizing:border-box!important;
        width:100%!important;
        min-width:0!important;
        min-height:40px!important;
        padding:7px 8px!important;
        border-radius:9px!important;
        font-size:10px!important;
        white-space:nowrap!important;
        overflow:hidden!important;
        text-overflow:ellipsis!important;
      }
      @media(max-height:520px){
        html.ptbo-mobile-tablet-fit #ptbo-response-tablet .tablet-kicker,
        html.ptbo-mobile-tablet-fit #ptbo-response-tablet .tablet-address{display:none!important}
        html.ptbo-mobile-tablet-fit #ptbo-response-tablet .tablet-topbar{padding:5px 7px!important}
        html.ptbo-mobile-tablet-fit #ptbo-tablet-close{width:34px!important;height:34px!important;min-width:34px!important;min-height:34px!important}
        html.ptbo-mobile-tablet-fit #ptbo-response-tablet .tablet-footer{padding:4px!important}
        html.ptbo-mobile-tablet-fit #ptbo-response-tablet .tablet-actions{gap:4px!important}
        html.ptbo-mobile-tablet-fit #ptbo-response-tablet .tablet-btn{min-height:34px!important;padding:5px 6px!important;font-size:9px!important}
      }
      @media(max-width:340px){
        html.ptbo-mobile-tablet-fit #ptbo-response-tablet{border-width:3px!important;border-radius:12px!important}
        html.ptbo-mobile-tablet-fit #ptbo-response-tablet .tablet-title{font-size:13px!important}
      }
    `;
    document.head.appendChild(style);
    document.documentElement.classList.add('ptbo-mobile-tablet-fit');

    let resizeTimer = 0;
    const syncViewport = () => {
      const visualHeight = Math.max(240, Math.floor(window.visualViewport?.height || innerHeight || document.documentElement.clientHeight || 0));
      document.documentElement.style.setProperty('--ptbo-tablet-visual-height', `${visualHeight}px`);
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        try {
          const tablet = window.PTBO_RESPONSE_TABLET;
          if (!tablet?.state?.open) return;
          tablet.state.tabletMap?.invalidateSize?.(false);
        } catch (_) {}
      }, 60);
    };

    syncViewport();
    addEventListener('resize', syncViewport, { passive:true });
    addEventListener('orientationchange', () => setTimeout(syncViewport, 80), { passive:true });
    window.visualViewport?.addEventListener?.('resize', syncViewport, { passive:true });
    window.visualViewport?.addEventListener?.('scroll', syncViewport, { passive:true });
  }

  installMobileTabletFit();
  load('route-compare-1.4.2.js', 'data-ptbo-route-compare-core', 'Unable to load the stable post-call route comparison system.');
  load('route-review-ui-1.4.3.js', 'data-ptbo-route-review-ui', 'Unable to load the polished post-call route review interface.');
})();