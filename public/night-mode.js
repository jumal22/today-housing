/* 불 끄기(밤 모드) — plan3d.html(편집기 · 배치 수정 팝업) 과 post.html(갤러리 상세)이 같이 씀.
   OHNight.create({ THREE, scene, renderer, container, hemi, dirs, getFurniture, getPhotoFloor })
   → { set(on, immediate), isOn(), update(), dispose() }
   - 기본 조명(반구광/직사광)을 푸르스름하게 낮추고, 놓아둔 조명 가구(천장등/스탠드/탁상등)마다 따뜻한 점광원 + 은은한 빛무리를 켬.
   - 점광원은 최대 MAX_LIGHTS개. 그림자는 기본 꺼짐 — 불을 끌 때 뜨는 말풍선에서 "그림자 추가"를 고르면 모든 점광원이 그림자를 드리움(터치 기기/작은 화면에선 아예 안 물어봄). 가구가 움직일 때만 다시 그림.
   - 밤/낮 상태는 저장하지 않음(보는 사람 화면에서만 바뀜). */
(function(){
  var MAX_LIGHTS = 10; // 점광원 최대 개수 — 그림자도 같은 수까지(사용자가 말풍선에서 켰을 때만)
  var LAMPS = {
    ceilinglight: { I: 1.0,  D: 8.5, S: 1.05, order: 0, dy: 0,    decay: 1.8 },
    floorlamp:    { I: 1.0,  D: 6.5, S: 0.85, order: 1, dy: 0.2,  decay: 1.4 },
    tablelamp:    { I: 1.0,  D: 5.5, S: 0.6, order: 2, dy: 0.28, decay: 1.2 }
  };
  var cssDone = false;
  function injectCss(){
    if (cssDone) return; cssDone = true;
    var st = document.createElement('style');
    st.textContent =
      '.oh-nightable{isolation:isolate;}.oh-nightable::before{content:"";position:absolute;inset:0;z-index:-1;pointer-events:none;opacity:0;transition:opacity .8s ease;' +
      'background:radial-gradient(ellipse at 50% 30%, #2a3566 0%, #171e3d 52%, #0a0e21 100%);}' +
      '.oh-nightable.oh-night::before{opacity:1;}' +
      '@media (prefers-reduced-motion: reduce){.oh-nightable::before{transition:none;}}' +
      '.oh-night-bubble{position:absolute;z-index:30;width:230px;box-sizing:border-box;padding:13px 13px 11px;border-radius:14px;background:var(--paper-raised,#fff);color:var(--ink,#222);' +
      'border:1px solid color-mix(in srgb, var(--blueprint,#c4703f) 45%, var(--line,#ddd));box-shadow:0 12px 30px var(--shadow,rgba(0,0,0,.25));transform-origin:var(--arrow-x,200px) 0;animation:ohNightPop .3s cubic-bezier(.34,1.56,.64,1) both;}' +
      '.oh-night-bubble.out{animation:ohNightOut .16s ease both;}' +
      '.oh-night-bubble::before{content:"";position:absolute;top:-8px;left:calc(var(--arrow-x,200px) - 7px);width:14px;height:14px;background:var(--paper-raised,#fff);transform:rotate(45deg);' +
      'border-left:1px solid color-mix(in srgb, var(--blueprint,#c4703f) 45%, var(--line,#ddd));border-top:1px solid color-mix(in srgb, var(--blueprint,#c4703f) 45%, var(--line,#ddd));}' +
      '.oh-night-bubble p{margin:0 0 10px;font-size:.84rem;line-height:1.5;word-break:keep-all;}' +
      '.oh-night-bubble p strong{color:var(--blueprint,#c4703f);}.oh-night-bubble p span{font-size:.76rem;color:var(--ink-soft,#777);}' +
      '.oh-night-bubble-actions{display:flex;gap:7px;}' +
      '.oh-night-bubble-actions button{flex:1;height:32px;border-radius:8px;font:inherit;font-size:.78rem;font-weight:700;cursor:pointer;border:1px solid var(--line,#ddd);background:var(--paper,#f7f7f7);color:var(--ink,#222);}' +
      '.oh-night-bubble-actions button:hover{border-color:var(--blueprint,#c4703f);}' +
      '.oh-night-bubble-actions .pri{background:var(--blueprint,#c4703f);border-color:var(--blueprint,#c4703f);color:var(--paper,#fff);}' +
      '@keyframes ohNightPop{0%{opacity:0;transform:scale(.6) translateY(-6px);}100%{opacity:1;transform:none;}}@keyframes ohNightOut{to{opacity:0;transform:scale(.9);}}' +
      '@media (prefers-reduced-motion: reduce){.oh-night-bubble{animation:none;}}';
    document.head.appendChild(st);
  }
  function glowTexture(THREE){
    var c = document.createElement('canvas'); c.width = c.height = 128;
    var g = c.getContext('2d'), grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,236,190,1)');
    grd.addColorStop(0.18, 'rgba(255,205,130,.55)');
    grd.addColorStop(0.5, 'rgba(255,170,80,.14)');
    grd.addColorStop(1, 'rgba(255,150,60,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
    var t = new THREE.CanvasTexture(c); t.needsUpdate = true; return t;
  }
  function lerp(a, b, t){ return a + (b - a) * t; }

  function create(o){
    var THREE = o.THREE, scene = o.scene, renderer = o.renderer, container = o.container;
    injectCss();
    if (container && getComputedStyle(container).position === 'static') container.style.position = 'relative';
    if (container) container.classList.add('oh-nightable');

    var coarse = false;
    try { coarse = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches); } catch (e) {}
    var smallScreen = Math.min(window.innerWidth || 1000, window.innerHeight || 1000) < 520;
    var shadowCapable = !coarse && !smallScreen && !!renderer.shadowMap && !window.OH_NO_SHADOW;
    var shadowOn = false;
    var shadowCap = Math.max(1, Math.min(MAX_LIGHTS, ((renderer.capabilities && renderer.capabilities.maxTextures) || 16) - 5)); // 그림자 맵마다 텍스처 슬롯을 하나씩 써서, 슬롯이 모자란 기기에선 그림자 조명 수를 줄임
    try { shadowOn = shadowCapable && (window.__ohNightShadow === true || (window.__ohNightShadow === undefined && localStorage.getItem('oh-night-shadow') === '1')); } catch (e) { shadowOn = shadowCapable && window.__ohNightShadow === true; }

    var hemi = o.hemi, dirs = o.dirs || [];
    var DAY = { hSky: hemi.color.clone(), hGround: hemi.groundColor.clone(), hI: hemi.intensity, dI: dirs.map(function (d) { return d.intensity; }), dC: dirs.map(function (d) { return d.color.clone(); }) };
    var WARM = new THREE.Color(0xffc48a), warmK = 0, skyTmp = new THREE.Color();
    var NIGHT = { hSky: new THREE.Color(0x7d8fd6), hGround: new THREE.Color(0x151a33), hI: 0.3, dI: [0.17, 0.07], dC: new THREE.Color(0x9db0ff) };
    var tmpC = new THREE.Color();

    var on = false, active = false, k = 0, last = performance.now();
    var pool = null, sprites = [], glowTex = null, lampInfo = [];
    var shadowSig = null, shadowCooldown = 0, sweepT = 0, shadowForce = 0;
    var box = new THREE.Box3(), tmpV = new THREE.Vector3();

    function ensurePool(){
      if (pool) return;
      pool = [];
      for (var i = 0; i < MAX_LIGHTS; i++){
        var L = new THREE.PointLight(0xffc27a, 0, 8, 2);
        L.shadow.mapSize.set(512, 512);
        L.shadow.camera.near = 0.12;
        L.shadow.camera.far = 12; L.shadow.camera.updateProjectionMatrix();
        L.shadow.bias = -0.002;
        pool.push(L);
      }
      glowTex = glowTexture(THREE);
    }
    function ensureSprite(i){
      while (sprites.length <= i){
        var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
        sp.renderOrder = 5; sp.visible = false; sp.raycast = function () {};
        scene.add(sp); sprites.push(sp);
      }
    }
    function flagMaterials(){
      scene.traverse(function (m){
        if (!m.isMesh || !m.material) return;
        (Array.isArray(m.material) ? m.material : [m.material]).forEach(function (mt){ mt.needsUpdate = true; });
      });
    }
    function swapFloor(toNight){
      var m = o.getPhotoFloor && o.getPhotoFloor();
      if (!m) return;
      if (toNight && !m.userData._ohBasic){
        var bm = m.material;
        if (!bm || !bm.map) return;
        m.userData._ohBasic = bm;
        m.material = new THREE.MeshStandardMaterial({ map: bm.map, roughness: 1, metalness: 0, polygonOffset: bm.polygonOffset, polygonOffsetFactor: bm.polygonOffsetFactor, polygonOffsetUnits: bm.polygonOffsetUnits });
      } else if (!toNight && m.userData._ohBasic){
        var lm = m.material; m.material = m.userData._ohBasic; m.userData._ohBasic = null;
        if (lm && lm.dispose) lm.dispose();
      }
    }
    // 그림자 플래그: 가구(조명 가구 자신은 제외)는 드리우고 받고, 바닥/벽은 받기만 함.
    function sweepFlags(){
      var furn = o.getFurniture() || [], inFurn = [];
      furn.forEach(function (g){
        var lamp = !!LAMPS[g.userData && g.userData.type];
        g.traverse(function (m){
          if (!m.isMesh) return;
          m.castShadow = !lamp; m.receiveShadow = !lamp;
          inFurn.push(m);
        });
      });
      scene.traverse(function (m){
        if (!m.isMesh || inFurn.indexOf(m) >= 0) return;
        if (m.geometry && m.geometry.type === 'RingGeometry') return;
        m.castShadow = false; m.receiveShadow = true;
      });
    }
    function activate(){
      if (active) return;
      active = true;
      ensurePool();
      pool.forEach(function (L){ scene.add(L); });
      if (shadowOn) enableShadows(true);
      swapFloor(true);
      flagMaterials();
    }
    function enableShadows(skipFlag){
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.shadowMap.autoUpdate = false;
      sweepFlags();
      shadowForce = 12;
      shadowSig = null;
      if (!skipFlag) flagMaterials();
    }
    function disableShadows(){
      renderer.shadowMap.enabled = false; renderer.shadowMap.autoUpdate = true;
      if (pool) pool.forEach(function (L){ L.castShadow = false; if (L.shadow && L.shadow.map){ L.shadow.map.dispose(); L.shadow.map = null; } });
      flagMaterials();
    }
    function deactivate(){
      if (!active) return;
      active = false;
      pool.forEach(function (L){ scene.remove(L); L.intensity = 0; });
      sprites.forEach(function (s){ s.visible = false; });
      swapFloor(false);
      if (shadowOn){ renderer.shadowMap.enabled = false; renderer.shadowMap.autoUpdate = true; pool.forEach(function (L){ L.castShadow = false; if (L.shadow && L.shadow.map){ L.shadow.map.dispose(); L.shadow.map = null; } }); }
      flagMaterials();
    }

    // ---- 모델 모양에서 전구 위치 찾기 ----
    // "불빛 재질"(lamp / Light / White)이 입혀진 메쉬의 꼭짓점을 이어진 덩어리(전구/갓)별로 묶어서, 덩어리마다 빛무리 하나씩.
    // 실제 광원(PointLight)은 가구당 1개 — 전구들 한가운데(평균 위치)에서 나옴. 못 찾으면 모양 종류별 대략 위치.
    var LIGHT_MAT = /^(lamp|light|white)$/i;
    var bulbCache = {}, inv = new THREE.Matrix4(), rel = new THREE.Matrix4(), tv = new THREE.Vector3();
    function meshCount(g){ var n = 0; g.traverse(function (m){ if (m.isMesh) n++; }); return n; }
    function findBulbs(g){
      var key = (g.userData.variant || ('legacy:' + g.userData.type));
      var mc = meshCount(g);
      var c = bulbCache[key];
      if (c && c.mc === mc) return c.bulbs;
      g.updateMatrixWorld(true);
      inv.copy(g.matrixWorld).invert();
      var comps = [];
      g.traverse(function (m){
        if (!m.isMesh || !m.geometry || !m.geometry.attributes.position) return;
        var mats = Array.isArray(m.material) ? m.material : [m.material];
        if (!mats.some(function (mt){ return mt && LIGHT_MAT.test(mt.name || ''); })) return;
        var geo = m.geometry, pos = geo.attributes.position, n = pos.count;
        var par = new Int32Array(n); for (var i = 0; i < n; i++) par[i] = i;
        function find(x){ while (par[x] !== x){ par[x] = par[par[x]]; x = par[x]; } return x; }
        function uni(a, b){ a = find(a); b = find(b); if (a !== b) par[a] = b; }
        var idx = geo.index ? geo.index.array : null, tri = idx ? idx.length : n;
        for (var t = 0; t + 2 < tri; t += 3){
          var a = idx ? idx[t] : t, b2 = idx ? idx[t + 1] : t + 1, c2 = idx ? idx[t + 2] : t + 2;
          uni(a, b2); uni(b2, c2);
        }
        var seen = {};
        for (var v = 0; v < n; v++){ // 같은 자리 꼭짓점(법선 때문에 갈라진 것)도 한 덩어리로
          var k = Math.round(pos.getX(v) * 1e4) + ',' + Math.round(pos.getY(v) * 1e4) + ',' + Math.round(pos.getZ(v) * 1e4);
          if (seen[k] !== undefined) uni(v, seen[k]); else seen[k] = v;
        }
        rel.multiplyMatrices(inv, m.matrixWorld);
        var boxes = {};
        for (var v2 = 0; v2 < n; v2++){
          var r = find(v2);
          tv.set(pos.getX(v2), pos.getY(v2), pos.getZ(v2)).applyMatrix4(rel);
          var bx = boxes[r] || (boxes[r] = { min: new THREE.Vector3(1e9, 1e9, 1e9), max: new THREE.Vector3(-1e9, -1e9, -1e9) });
          bx.min.min(tv); bx.max.max(tv);
        }
        Object.keys(boxes).forEach(function (r){ comps.push(boxes[r]); });
      });
      var bulbs = null;
      if (comps.length){
        var ext = function (b){ return Math.max(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z); };
        comps.sort(function (a, b){ return ext(b) - ext(a); });
        var big = ext(comps[0]);
        bulbs = comps.filter(function (b){ return ext(b) >= big * 0.3; }).slice(0, 5).map(function (b){
          return new THREE.Vector3((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2);
        });
      }
      bulbCache[key] = { mc: mc, bulbs: bulbs, dbg: comps.map(function (b){ return [+(b.max.x - b.min.x).toFixed(3), +(b.max.y - b.min.y).toFixed(3), +(b.max.z - b.min.z).toFixed(3), +((b.min.y + b.max.y) / 2).toFixed(3)]; }) };
      return bulbs;
    }
    function collectLamps(){
      var furn = o.getFurniture() || [], out = [];
      furn.forEach(function (g){
        var t = g.userData && g.userData.type;
        if (!LAMPS[t]) return;
        box.setFromObject(g);
        if (box.isEmpty()) return; // 아직 모델이 안 불러와짐
        g.updateMatrixWorld(true);
        var bl = findBulbs(g), pts = [], cx, cy, cz;
        if (bl && bl.length){
          cx = cy = cz = 0;
          bl.forEach(function (lp){
            var w = lp.clone().applyMatrix4(g.matrixWorld);
            pts.push(w); cx += w.x; cy += w.y; cz += w.z;
          });
          cx /= pts.length; cy /= pts.length; cz /= pts.length;
        } else {
          var h = box.max.y - box.min.y;
          cx = (box.min.x + box.max.x) / 2; cz = (box.min.z + box.max.z) / 2;
          cy = t === 'ceilinglight' ? box.min.y + h * 0.1 : (t === 'floorlamp' ? box.max.y - h * 0.2 : box.max.y - h * 0.35);
          pts.push(new THREE.Vector3(cx, cy, cz));
        }
        out.push({ t: t, x: cx, y: cy, z: cz, bulbs: pts, order: LAMPS[t].order });
      });
      out.sort(function (a, b){ return a.order - b.order; });
      return out;
    }
    function furnSig(furn){
      var s = 0;
      for (var i = 0; i < furn.length; i++){
        var g = furn[i];
        s += (g.position.x * 13.1 + g.position.y * 17.3 + g.position.z * 19.7 + g.rotation.y * 7.9 + g.scale.x * 3.3 + g.scale.y * 5.1 + g.scale.z * 2.7 + g.children.length * 0.37 + g.visible * 1.3) * (i + 1);
        if (g.children[0]) s += g.children[0].children.length * 0.11 * (i + 1);
      }
      return s + furn.length * 1000;
    }

    function applyBlend(e){
      skyTmp.copy(NIGHT.hSky).lerp(WARM, 0.3 * warmK); // 조명이 많을수록 방 전체가 따뜻하게 번짐(간접광 흉내)
      hemi.color.copy(DAY.hSky).lerp(skyTmp, e);
      hemi.groundColor.copy(DAY.hGround).lerp(NIGHT.hGround, e);
      hemi.intensity = lerp(DAY.hI, NIGHT.hI + 0.1 * warmK, e);
      dirs.forEach(function (d, i){
        d.intensity = lerp(DAY.dI[i], NIGHT.dI[Math.min(i, NIGHT.dI.length - 1)], e);
        d.color.copy(DAY.dC[i]).lerp(NIGHT.dC, e);
      });
    }

    function update(){
      var now = performance.now(), dt = Math.min((now - last) / 1000, 0.1); last = now;
      var target = on ? 1 : 0;
      if (k !== target){
        var step = dt / 0.9;
        k = target > k ? Math.min(target, k + step) : Math.max(target, k - step);
        var e = k * k * (3 - 2 * k);
        applyBlend(e);
        if (k === 0) deactivate();
      }
      if (!active) return;
      var ek = k * k * (3 - 2 * k);
      var lamps = collectLamps();
      for (var i = 0; i < MAX_LIGHTS; i++){
        var L = pool[i], lp = lamps[i];
        if (lp){
          var cfg = LAMPS[lp.t];
          L.position.set(lp.x, lp.y + cfg.dy, lp.z); // 낮은 조명은 빛을 살짝 위에서 쏴서 멀리 있는 바닥에도 덜 비스듬히 닿게
          L.intensity = cfg.I * ek;
          L.distance = cfg.D;
          L.decay = cfg.decay;
          L.visible = true;
          L.castShadow = shadowOn && i < shadowCap;
        } else {
          L.intensity = 0; L.visible = false; L.castShadow = false;
        }
      }
      var wt = Math.min(1, lamps.length / 3);
      warmK += (wt - warmK) * Math.min(1, dt * 3);
      applyBlend(ek);
      var spi = 0;
      for (var j = 0; j < lamps.length; j++){
        var lq = lamps[j], c2 = LAMPS[lq.t], nb = lq.bulbs.length;
        for (var bi = 0; bi < nb && spi < 14; bi++, spi++){
          ensureSprite(spi);
          var sp = sprites[spi];
          sp.visible = true; sp.position.copy(lq.bulbs[bi]);
          sp.scale.setScalar(c2.S * (nb > 1 ? 0.62 : 1.0)); // 전구가 여럿이면 하나하나는 작게
          sp.material.opacity = 0.9 * ek;
        }
      }
      for (var q = spi; q < sprites.length; q++) sprites[q].visible = false;
      swapFloor(true);
      if (shadowOn){
        sweepT += dt;
        if (sweepT > 0.5){ sweepT = 0; sweepFlags(); shadowForce = Math.max(shadowForce, 1); }
        var sg = furnSig(o.getFurniture() || []);
        shadowCooldown -= dt;
        if (sg !== shadowSig && shadowCooldown <= 0){ shadowSig = sg; shadowCooldown = 0.05; renderer.shadowMap.needsUpdate = true; }
        else if (shadowForce > 0){ shadowForce--; renderer.shadowMap.needsUpdate = true; }
      }
    }

    function set(v, immediate){
      v = !!v;
      if (v === on && !immediate) return;
      on = v;
      if (container) container.classList.toggle('oh-night', on);
      if (on) activate();
      if (immediate){
        k = on ? 1 : 0; applyBlend(k);
        if (!on) deactivate();
        else update();
      }
    }
    // ---- 그림자 선택(말풍선) ----
    function setShadow(v){
      v = !!v && shadowCapable;
      if (v === shadowOn) return;
      shadowOn = v;
      if (active){ if (v) enableShadows(); else disableShadows(); }
    }
    function onShadowEvt(e){ setShadow(!!(e.detail && e.detail.on)); }
    window.addEventListener('oh-night-shadow', onShadowEvt);
    var bubble = null, bubbleKill = null;
    function closeBubble(){
      if (bubbleKill){ bubbleKill(); bubbleKill = null; }
      if (bubble){ var b = bubble; bubble = null; b.classList.add('out'); setTimeout(function (){ if (b.parentNode) b.parentNode.removeChild(b); }, 160); }
    }
    // 불 끄기 버튼 바로 밑 말풍선: 그림자 추가/끄기 선택. 이 페이지의 모든 3D 화면(window 이벤트)에 같이 적용되고 localStorage 에 기억.
    function askShadow(anchor){
      if (!shadowCapable || !anchor || !container) return;
      closeBubble();
      var b = document.createElement('div');
      b.className = 'oh-night-bubble'; b.setAttribute('role', 'dialog');
      var isOn = shadowOn;
      b.innerHTML = '<p><strong>' + (isOn ? '그림자가 켜져 있어요' : '그림자도 추가할까요?') + '</strong><br><span>' + (isOn ? '끄면 화면이 더 부드러워져요' : '기기에 따라 화면이 느려질 수 있어요') + '</span></p>' +
        '<div class="oh-night-bubble-actions"><button type="button" data-act="keep">' + (isOn ? '유지' : '지금처럼') + '</button><button type="button" class="pri" data-act="go">' + (isOn ? '그림자 끄기' : '그림자 추가') + '</button></div>';
      container.appendChild(b);
      var cr = container.getBoundingClientRect(), ar = anchor.getBoundingClientRect();
      var w = b.offsetWidth || 230;
      var cx = ar.left + ar.width / 2 - cr.left;
      var left = Math.min(Math.max(8, cx - w + 40), Math.max(8, cr.width - w - 8));
      b.style.left = left + 'px'; b.style.top = (ar.bottom - cr.top + 12) + 'px';
      b.style.setProperty('--arrow-x', Math.min(w - 22, Math.max(16, cx - left)) + 'px');
      bubble = b;
      function choose(on){
        window.__ohNightShadow = on;
        try { localStorage.setItem('oh-night-shadow', on ? '1' : '0'); } catch (e) {}
        window.dispatchEvent(new CustomEvent('oh-night-shadow', { detail: { on: on } }));
        closeBubble();
      }
      b.querySelector('[data-act="go"]').addEventListener('click', function (){ choose(!isOn); });
      b.querySelector('[data-act="keep"]').addEventListener('click', closeBubble);
      function onDown(e){ if (!b.contains(e.target) && !anchor.contains(e.target)) closeBubble(); }
      function onKey(e){ if (e.key === 'Escape') closeBubble(); }
      document.addEventListener('pointerdown', onDown, true);
      document.addEventListener('keydown', onKey, true);
      var tm = setTimeout(closeBubble, 9000);
      bubbleKill = function (){ document.removeEventListener('pointerdown', onDown, true); document.removeEventListener('keydown', onKey, true); clearTimeout(tm); };
    }
    function dispose(){
      closeBubble();
      window.removeEventListener('oh-night-shadow', onShadowEvt);
      if (container){ container.classList.remove('oh-night', 'oh-nightable'); }
      if (active) deactivate();
      sprites.forEach(function (s){ scene.remove(s); s.material.dispose(); });
      sprites = [];
      if (glowTex) glowTex.dispose();
      if (pool) pool.forEach(function (L){ if (L.shadow && L.shadow.map) L.shadow.map.dispose(); });
    }
    return { set: set, isOn: function (){ return on; }, update: update, dispose: dispose, askShadow: askShadow, closeBubble: closeBubble, canShadow: shadowCapable, hasShadow: function (){ return shadowOn; }, _dbg: function (){ return { cache: bulbCache, pool: pool, lampInfo: collectLamps(), sprites: sprites, shadowOn: shadowOn }; } };
  }
  window.OHNight = { create: create };
})();
