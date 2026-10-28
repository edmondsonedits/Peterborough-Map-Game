'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const server = http.createServer((req,res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/') { res.writeHead(200, {'Content-Type':'text/html'}); return res.end('<!doctype html>'); }
  const file = path.resolve(root, '.' + pathname);
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  fs.readFile(file, (err,data) => { if(err) return res.writeHead(404).end(); res.writeHead(200,{'Content-Type':'text/javascript'}); res.end(data); });
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({headless:true, executablePath:process.env.CHROME_PATH || undefined});
  try {
    for (const emulator of [false,true]) {
      const page = await browser.newPage();
      await page.route('https://www.gstatic.com/firebasejs/12.5.0/*', route => {
        const file = new URL(route.request().url()).pathname.split('/').pop();
        const modules = {
          'firebase-app.js': 'export const getApps=()=>[]; export const initializeApp=()=>({name:"ptbo-feedback"});',
          'firebase-auth.js': 'export const getAuth=()=>{window.steps.push("auth");return {currentUser:null,authStateReady:async()=>{}}}; export const onIdTokenChanged=()=>{}; export const connectAuthEmulator=()=>{};',
          'firebase-firestore.js': 'export const getFirestore=()=>{window.steps.push("firestore");return {}}; export const connectFirestoreEmulator=()=>{};',
          'firebase-app-check.js': 'export class ReCaptchaEnterpriseProvider {constructor(key){window.steps.push("provider:"+key)}} export const initializeAppCheck=(app,options)=>{window.steps.push("appcheck:"+options.isTokenAutoRefreshEnabled)};',
        };
        return route.fulfill({status:200,contentType:'text/javascript',headers:{'Access-Control-Allow-Origin':'*'},body:modules[file] || ''});
      });
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      const steps=await page.evaluate(async emulator => {
        window.steps=[];
        const {createFeedbackService}=await import('/feedback/service.mjs');
        const config={enabled:true,firebase:{apiKey:'fake',projectId:'fake'},appCheckSiteKey:'example-key'};
        if(emulator)config.emulators={auth:'http://127.0.0.1:9098',firestore:{host:'127.0.0.1',port:8086}};
        await createFeedbackService(config).ready;
        return window.steps;
      },emulator);
      if(emulator) assert.deepEqual(steps,['auth','firestore']);
      else assert.deepEqual(steps,['provider:example-key','appcheck:true','auth','firestore']);
      await page.close();
    }
    console.log('PASS: App Check starts before Firebase services, and emulators skip it.');
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1});
