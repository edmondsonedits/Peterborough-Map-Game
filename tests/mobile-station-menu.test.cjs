'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('../tools/location-report-tests/node_modules/jsdom');
const source=fs.readFileSync(path.join(__dirname,'..','city-explorer','mobile-controls-1.6.68.js'),'utf8');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function fixture(t){
 const dom=new JSDOM(`<!doctype html><html><body><main id="app">
  <nav class="control-panel"><button id="normal-action" class="hud-button"><span>Action</span></button>
   <select id="station-select" class="hud-button"><option value="1">Station 1</option><option value="2">Station 2</option><option value="3">Station 3</option></select>
  </nav>
  <div id="touch-controls"><div class="mobile-joystick-wrap"><div id="movement-joystick"><div class="joystick-knob"></div></div><span class="mobile-control-caption">Move</span></div>
   <div class="mobile-action-wrap"><button id="mobile-action-button"><span id="mobile-action-label"></span><span id="mobile-action-detail"></span></button></div>
   <div class="mobile-flight-pad"><button data-mobile-command="KeyQ">Down</button></div>
   <button id="mobile-menu-toggle" aria-expanded="false">Menu</button><button id="mobile-menu-scrim">Scrim</button>
  </div>
  <div id="interaction-prompt"></div>
 </main></body></html>`,{url:'https://example.test/city-explorer/',runScripts:'outside-only'});
 t.after(()=>dom.window.close());
 dom.window.eval(source);
 const {document}=dom.window;
 return{window:dom.window,document,app:document.getElementById('app'),menu:document.getElementById('mobile-menu-toggle'),scrim:document.getElementById('mobile-menu-scrim'),panel:document.querySelector('.control-panel'),select:document.getElementById('station-select'),button:document.getElementById('normal-action'),joystick:document.getElementById('movement-joystick'),knob:document.querySelector('.joystick-knob')};
}
function isOpen(h){return h.app.classList.contains('mobile-menu-open');}
function open(h){h.menu.click();assert.equal(isOpen(h),true);}

test('station picker click and option click keep the mobile menu open until change commits',async t=>{
 const h=fixture(t);open(h);
 h.select.dispatchEvent(new h.window.MouseEvent('click',{bubbles:true,cancelable:true}));
 await wait(550);assert.equal(isOpen(h),true,'opening native select must not dismiss its parent menu');
 h.select.options[1].dispatchEvent(new h.window.MouseEvent('click',{bubbles:true,cancelable:true}));
 await wait(550);assert.equal(isOpen(h),true,'option click alone must not close before a committed change');
 h.select.value='2';h.select.dispatchEvent(new h.window.Event('change',{bubbles:true}));
 await wait(120);assert.equal(isOpen(h),false,'committed station change closes the menu');
});

test('ordinary nested button click still closes the menu',async t=>{
 const h=fixture(t);open(h);
 h.button.querySelector('span').click();
 await wait(120);assert.equal(isOpen(h),false);
});

test('scrim and menu toggle continue to open and close the menu',async t=>{
 const h=fixture(t);open(h);h.scrim.click();assert.equal(isOpen(h),false);
 open(h);h.menu.click();assert.equal(isOpen(h),false);
});

test('window blur preserves a focused station menu and resets active joystick input',t=>{
 const h=fixture(t);open(h);h.select.focus();
 h.joystick.classList.add('is-active','is-running');h.joystick.dataset.direction='forward';h.joystick.dataset.strength='strong';
 h.joystick.dataset.gait='sprint';
 h.knob.style.transform='translate3d(23px, 0, 0)';
 h.window.dispatchEvent(new h.window.Event('blur'));
 assert.equal(isOpen(h),true,'native picker focus blur must not dismiss the menu');
 assert.equal(h.joystick.classList.contains('is-active'),false);assert.equal(h.joystick.classList.contains('is-running'),false);
 assert.equal(h.joystick.hasAttribute('data-direction'),false);assert.equal(h.joystick.hasAttribute('data-strength'),false);
 assert.equal(h.joystick.hasAttribute('data-gait'),false);
 assert.equal(h.knob.style.transform,'translate3d(0, 0, 0)');
});

test('visibilitychange still closes the menu even when the station select is focused',t=>{
 const h=fixture(t);open(h);h.select.focus();
 Object.defineProperty(h.document,'hidden',{configurable:true,get:()=>true});
 h.document.dispatchEvent(new h.window.Event('visibilitychange'));
 assert.equal(isOpen(h),false);
});
