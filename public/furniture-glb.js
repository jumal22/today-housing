/* 오늘의 하우징 — GLB 가구 모듈 (에디터 plan3d.html 과 게시물 뷰어 post.html 이 같이 씀)
 * - 가구 종류마다 모양(variant) 5개 이내. 저장 데이터에는 모양의 id(예: "sofa_01")를 기록함.
 * - 원본 GLB 는 크기·방향·원점이 제각각이라, 불러올 때 아래 SPEC 대로 보정해서
 *   "앞면 방향 / 실제 크기(m) / 원점(바닥 중앙)"을 사이트 규칙에 맞춤.
 *     · 바닥 가구(소파·침대 등): 앞면 = -z, 원점 = 바닥 중앙
 *     · 벽 가구(문·창문·콘센트): 앞면 = +z, 문은 바닥 중앙, 창문·콘센트는 정중앙
 * - 불러오기에 실패하면(오프라인 등) 호출한 쪽이 기존 도형 가구로 대신 그리게 됨(OH_GLB.load 가 reject).
 */
(function(){
  var BASE = '/models/';
  var PI = Math.PI;
  // fit: ['w'|'h'|'d', 미터] → 보정 후 그 축 길이를 맞추고 비율 유지. thick: 벽 가구의 두께(m) 강제.
  // rot: 원본의 앞면을 사이트 규칙에 맞추려고 y축으로 돌리는 각도. mount: floor | door | center | ceiling
  var SPEC = {
    sofa: { mount:'floor', items:[
      { id:'sofa_01', ko:'2인 소파',      en:'Loveseat',        rot:PI, fit:['w',1.75] },
      { id:'sofa_02', ko:'카우치 소파',   en:'Chaise sofa',     rot:PI, fit:['w',1.75] },
      { id:'sofa_03', ko:'코너 소파',     en:'Corner sofa',     rot:PI, fit:['w',1.75] },
      { id:'sofa_04', ko:'라운지 소파',   en:'Lounge sofa',     rot:PI, fit:['w',1.9] },
      { id:'sofa_05', ko:'라운지 코너 소파', en:'Lounge corner sofa', rot:PI, fit:['w',2.0] } ] },
    table: { mount:'floor', items:[
      { id:'table_01', ko:'식탁',          en:'Dining table',    rot:PI, fit:['w',1.6] },
      { id:'table_02', ko:'원형 테이블',   en:'Pedestal table',  rot:PI, fit:['w',1.0] },
      { id:'table_03', ko:'X다리 테이블',  en:'Cross-leg table', rot:PI, fit:['w',1.6] },
      { id:'table_04', ko:'커피 테이블',   en:'Coffee table',    rot:PI, fit:['w',1.0] },
      { id:'table_05', ko:'유리 커피 테이블', en:'Glass coffee table', rot:PI, fit:['w',0.6] } ] },
    bed: { mount:'floor', items:[
      { id:'bed_01', ko:'더블 침대',  en:'Double bed',  rot:PI, fit:['d',2.0] },
      { id:'bed_02', ko:'싱글 침대',  en:'Single bed',  rot:PI, fit:['d',2.0] },
      { id:'bed_03', ko:'2층 침대',   en:'Bunk bed',    rot:PI, fit:['d',2.0] },
      { id:'bed_04', ko:'킹 침대',    en:'King bed',    rot:PI, fit:['d',2.1] },
      { id:'bed_05', ko:'클래식 침대', en:'Classic bed', rot:PI, fit:['d',2.1] } ] },
    plant: { mount:'floor', items:[
      { id:'plant_01', ko:'화분',        en:'Potted plant',   rot:PI, fit:['h',1.0] },
      { id:'plant_02', ko:'작은 화분 A', en:'Small plant A',  rot:PI, fit:['h',0.4] },
      { id:'plant_03', ko:'작은 화분 B', en:'Small plant B',  rot:PI, fit:['h',0.4] },
      { id:'plant_04', ko:'작은 화분 C', en:'Small plant C',  rot:PI, fit:['h',0.4] },
      { id:'plant_05', ko:'관엽식물',    en:'Houseplant',     rot:PI, fit:['h',0.9] } ] },
    door: { mount:'door', items:[
      { id:'door_01', ko:'나무 문',     en:'Wood door',      rot:0,    fit:['h',2.05], thick:0.14, hinge:'door' },
      { id:'door_02', ko:'유리창 문',   en:'Glass-panel door', rot:0,  fit:['h',2.05], thick:0.14, hinge:'door' },
      { id:'door_03', ko:'판넬 문',     en:'Panel door',     rot:PI/2, fit:['h',2.05], thick:0.14, hinge:'all' },
      { id:'door_04', ko:'유리 판넬 문', en:'Panel door with glass', rot:PI/2, fit:['h',2.05], thick:0.14, hinge:'all' },
      { id:'door_05', ko:'아치 문',     en:'Arched door',    rot:PI/2, fit:['h',2.05], thick:0.14, hinge:'all' } ] },
    window: { mount:'center', items:[
      { id:'window_01', ko:'창문',        en:'Window',          rot:0, fit:['h',1.2], thick:0.11 },
      { id:'window_02', ko:'미닫이 창',   en:'Sliding window',  rot:0, fit:['h',1.2], thick:0.11 },
      { id:'window_03', ko:'격자 창',     en:'Paned window',    rot:PI/2, fit:['h',1.3], thick:0.11 },
      { id:'window_04', ko:'와이드 격자 창', en:'Wide paned window', rot:PI/2, fit:['w',2.0], thick:0.11 },
      { id:'window_05', ko:'아치 창',     en:'Arched window',   rot:PI/2, fit:['h',1.3], thick:0.11, arch:true } ,
      { id:'window_06', ko:'기본 창문',   en:'Basic window',    rot:0, fit:['h',1.1] } ] },
    outlet: { mount:'center', items:[
      { id:'outlet_02', ko:'콘센트 (2구)',  en:'Wall outlet (double)', rot:0,    fit:['h',0.12], thick:0.02 },
      { id:'outlet_03', ko:'콘센트 (멀티)', en:'Wall socket',          rot:-PI/2, fit:['w',0.14], thick:0.02 } ] },
    tv: { mount:'floor', items:[
      { id:'tv_01', ko:'모니터형 TV', en:'Modern TV',    rot:PI,   fit:['w',1.1] },
      { id:'tv_02', ko:'빈티지 TV',   en:'Vintage TV',   rot:PI,   fit:['w',0.6] },
      { id:'tv_03', ko:'스탠드 TV',   en:'Stand TV',     rot:PI/2, fit:['w',1.2] },
      { id:'tv_05', ko:'슬림 TV',     en:'Slim TV',      rot:PI,   fit:['w',1.2] } ] },
    // 벽걸이 TV: 받침이 없는 모델(tv_04)을 벽 아이템(콘센트처럼 구멍 없이 벽 표면에 붙음)으로 씀. 팔레트의 'TV' 묶음에 같이 보임.
    walltv: { mount:'center', items:[
      { id:'tv_04', ko:'벽걸이 TV',   en:'Wall-mounted TV', rot:0, fit:['w',1.2] } ] },
    ceilinglight: { mount:'ceiling', items:[
      { id:'ceiling_light_01', ko:'사각 천장등', en:'Square ceiling light', rot:0, fit:['h',0.25] },
      { id:'ceiling_light_02', ko:'펜던트 A',    en:'Pendant A',            rot:0, fit:['h',0.7] },
      { id:'ceiling_light_03', ko:'펜던트 B',    en:'Pendant B',            rot:0, fit:['h',0.6] },
      { id:'ceiling_light_04', ko:'샹들리에형',  en:'Chandelier',           rot:0, fit:['h',0.8] },
      { id:'ceiling_light_05', ko:'원형 천장등', en:'Round ceiling light',  rot:0, fit:['h',0.35] } ] },
    floorlamp: { mount:'floor', items:[
      { id:'floor_lamp_01', ko:'원통 스탠드',  en:'Round floor lamp',  rot:0, fit:['h',1.45] },
      { id:'floor_lamp_02', ko:'사각 스탠드',  en:'Square floor lamp', rot:0, fit:['h',1.45] },
      { id:'floor_lamp_03', ko:'슬림 스탠드',  en:'Slim floor lamp',   rot:0, fit:['h',1.6] },
      { id:'floor_lamp_04', ko:'큰 스탠드',    en:'Tall floor lamp',   rot:0, fit:['h',1.7] },
      { id:'floor_lamp_05', ko:'갓 스탠드',    en:'Shade floor lamp',  rot:0, fit:['h',1.4] } ] },
    tablelamp: { mount:'floor', items:[
      { id:'table_lamp_01', ko:'원통 탁상등',  en:'Round table lamp',  rot:0, fit:['h',0.42] },
      { id:'table_lamp_02', ko:'사각 탁상등',  en:'Square table lamp', rot:0, fit:['h',0.42] },
      { id:'table_lamp_03', ko:'스탠드 조명',  en:'Desk lamp',         rot:0, fit:['h',0.45] },
      { id:'table_lamp_04', ko:'갓 탁상등',    en:'Shade table lamp',  rot:0, fit:['h',0.5] },
      { id:'table_lamp_05', ko:'클래식 탁상등', en:'Classic table lamp', rot:0, fit:['h',0.42] } ] }
  };
  // 보정 후 크기(m) {w,h,d} — tools/ 의 계산 스크립트가 채움. 로드 전에도 동기적으로 baseSize 를 알려고 미리 넣어둠.
  var DIMS = /*DIMS*/{"sofa_01":{"w":1.75,"h":0.821,"d":0.732},"sofa_02":{"w":1.75,"h":0.821,"d":1.464},"sofa_03":{"w":1.75,"h":0.821,"d":1.75},"sofa_04":{"w":1.9,"h":0.679,"d":0.696},"sofa_05":{"w":2,"h":0.593,"d":2},"table_01":{"w":1.6,"h":0.621,"d":0.851},"table_02":{"w":1,"h":0.529,"d":1.155},"table_03":{"w":1.6,"h":0.652,"d":0.84},"table_04":{"w":1,"h":0.348,"d":0.605},"table_05":{"w":0.6,"h":0.345,"d":0.6},"bed_01":{"w":1.7,"h":0.667,"d":2.0},"bed_02":{"w":1.015,"h":0.667,"d":2.0},"bed_03":{"w":1.043,"h":1.553,"d":2},"bed_04":{"w":1.628,"h":0.645,"d":2.1},"bed_05":{"w":1.394,"h":0.768,"d":2.1},"plant_01":{"w":0.324,"h":1,"d":0.369},"plant_02":{"w":0.27,"h":0.4,"d":0.27},"plant_03":{"w":0.27,"h":0.4,"d":0.27},"plant_04":{"w":0.27,"h":0.4,"d":0.234},"plant_05":{"w":1.19,"h":0.9,"d":1.245},"door_01":{"w":0.987,"h":2.05,"d":0.14},"door_02":{"w":0.987,"h":2.05,"d":0.14},"door_03":{"w":0.903,"h":2.05,"d":0.14},"door_04":{"w":0.903,"h":2.05,"d":0.14},"door_05":{"w":0.903,"h":2.05,"d":0.14},"window_01":{"w":0.745,"h":1.2,"d":0.11},"window_02":{"w":0.745,"h":1.2,"d":0.11},"window_03":{"w":1.021,"h":1.3,"d":0.11},"window_04":{"w":2,"h":0.903,"d":0.11},"window_05":{"w":1.021,"h":1.3,"d":0.11},"outlet_02":{"w":0.073,"h":0.12,"d":0.02},"outlet_03":{"w":0.14,"h":0.082,"d":0.02},"tv_01":{"w":1.1,"h":0.73,"d":0.206},"tv_02":{"w":0.6,"h":0.395,"d":0.395},"tv_03":{"w":1.2,"h":0.742,"d":0.117},"tv_04":{"w":1.2,"h":0.706,"d":0.12},"tv_05":{"w":1.2,"h":0.804,"d":0.107},"ceiling_light_01":{"w":0.13,"h":0.25,"d":0.13},"ceiling_light_02":{"w":0.25,"h":0.7,"d":0.247},"ceiling_light_03":{"w":0.322,"h":0.6,"d":0.318},"ceiling_light_04":{"w":0.479,"h":0.8,"d":0.479},"ceiling_light_05":{"w":0.193,"h":0.35,"d":0.203},"floor_lamp_01":{"w":0.256,"h":1.45,"d":0.296},"floor_lamp_02":{"w":0.202,"h":1.45,"d":0.202},"floor_lamp_03":{"w":0.28,"h":1.6,"d":0.295},"floor_lamp_04":{"w":0.439,"h":1.7,"d":0.462},"floor_lamp_05":{"w":0.627,"h":1.4,"d":0.659},"table_lamp_01":{"w":0.203,"h":0.42,"d":0.235},"table_lamp_02":{"w":0.174,"h":0.42,"d":0.174},"table_lamp_03":{"w":0.197,"h":0.45,"d":0.356},"table_lamp_04":{"w":0.23,"h":0.5,"d":0.23},"table_lamp_05":{"w":0.203,"h":0.42,"d":0.203},"window_06":{"w":1.2,"h":1.1,"d":0.09}}/*END*/;
  var byId = {};
  Object.keys(SPEC).forEach(function(t){ SPEC[t].items.forEach(function(it){ it.type = t; it.mount = SPEC[t].mount; byId[it.id] = it; }); });

  var srcCache = {}, loaderP = null, T = null;
  function three(){ return T || (T = window.THREE); }
  function canLoad(){ return !!(three() && three().GLTFLoader); }
  function loadLoader(){
    if (canLoad()) return Promise.resolve();
    if (loaderP) return loaderP;
    loaderP = new Promise(function(res, rej){
      var s = document.createElement('script'); s.src = '/vendor/GLTFLoader.js';
      s.onload = function(){ canLoad() ? res() : rej(new Error('GLTFLoader missing')); };
      s.onerror = function(){ loaderP = null; rej(new Error('GLTFLoader load failed')); };
      document.head.appendChild(s);
    });
    return loaderP;
  }
  function fetchSrc(id){
    if (srcCache[id]) return srcCache[id];
    srcCache[id] = loadLoader().then(function(){
      return new Promise(function(res, rej){ new (three().GLTFLoader)().load(BASE + id + '.glb', function(g){ res(g.scene); }, undefined, rej); });
    });
    srcCache[id].catch(function(){ delete srcCache[id]; });
    return srcCache[id];
  }

  // 재질 정리: 광원 무시(unlit) → 일반 재질, 금속 제거(환경맵이 없어서 검게 나옴), 사이트가 sRGB 보정 없이(Linear) 그리므로 색 보정
  function prepMaterial(m){
    var THREE = three(), nm, unlit = !!m.isMeshBasicMaterial;
    if (unlit){
      nm = new THREE.MeshStandardMaterial({ color: m.color.clone(), map: m.map || null, transparent: m.transparent, opacity: m.opacity, side: m.side });
      nm.name = m.name; m = nm;
    } else if (m.clone){ m = m.clone(); }
    m.metalness = 0; m.roughness = Math.max(m.roughness == null ? 0.8 : m.roughness, 0.7);
    if (m.map){ m.map.encoding = THREE.LinearEncoding; m.map.needsUpdate = true; }
    // Kenney(unlit)는 색이 '그대로 보이도록' 만든 팔레트라 보정하지 않고, Quaternius 같은 PBR 재질만 선형→sRGB 보정
    if (!unlit && m.color && m.color.convertLinearToSRGB && !m.userData.__srgb){ m.color.convertLinearToSRGB(); m.userData.__srgb = true; }
    if (m.color) m.color.multiplyScalar(0.7);     // 사이트 조명이 밝아서(하늘광 .9 + 태양 .95) 원색 그대로면 하얗게 날아감
    if (m.emissive) m.emissive.setRGB(0,0,0);
    if (m.transparent) m.depthWrite = false;
    return m;
  }

  function build(spec, src){
    var THREE = three(), root = new THREE.Group(), scaler = new THREE.Group(), holder = new THREE.Group(), inst = src.clone(true);
    var area = {}; // 재질 이름별 삼각형 수 → 가장 많은 재질을 "색 바꾸기" 대상으로
    inst.traverse(function(o){
      if (!o.isMesh) return;
      o.material = prepMaterial(o.material);
      o.castShadow = false; o.receiveShadow = false;
      var tri = o.geometry.index ? o.geometry.index.count / 3 : (o.geometry.attributes.position.count / 3);
      var key = o.material.name || o.material.uuid;
      if (!o.material.transparent) area[key] = (area[key] || 0) + tri;
    });
    var best = null; Object.keys(area).forEach(function(k){ if (best == null || area[k] > area[best]) best = k; });
    inst.traverse(function(o){ if (o.isMesh) o.userData.colorable = ((o.material.name || o.material.uuid) === best); });
    holder.rotation.y = spec.rot || 0;
    holder.add(inst); scaler.add(holder); root.add(scaler);
    // 스케일은 회전 바깥(scaler)에 걸어서 '회전한 뒤의' 가로·세로·깊이 기준으로 적용
    root.updateMatrixWorld(true);
    var box = new THREE.Box3().setFromObject(scaler), size = box.getSize(new THREE.Vector3());
    var ax = spec.fit[0], s = spec.fit[1] / (ax === 'w' ? size.x : ax === 'h' ? size.y : size.z);
    scaler.scale.set(s, s, spec.thick ? spec.thick / size.z : s);
    root.updateMatrixWorld(true);
    box.setFromObject(scaler); box.getSize(size);
    var c = box.getCenter(new THREE.Vector3()), m = spec.mount;
    scaler.position.set(-c.x, m === 'center' ? -c.y : m === 'ceiling' ? -box.max.y : -box.min.y, -c.z);
    root.updateMatrixWorld(true);
    var hinge = null;
    if (spec.hinge){          // 문: 경첩 쪽(-x 모서리)에 회전축을 둔 그룹에 문짝만 옮겨 담음
      hinge = new THREE.Group(); hinge.position.set(-size.x / 2, 0, 0); root.add(hinge); root.updateMatrixWorld(true);
      var leaf = [];
      inst.traverse(function(o){
        if (!o.isMesh) return;
        if (spec.hinge === 'all') { leaf.push(o); return; }
        var p = o, isLeaf = false; while (p && p !== inst){ if (/^door$/i.test(p.name) || /handle/i.test(p.name)) isLeaf = true; p = p.parent; }
        if (isLeaf) leaf.push(o);
      });
      leaf.forEach(function(o){ hinge.attach(o); });
    }
    return { root: root, hinge: hinge, dims: { w: size.x, h: size.y, d: size.z } };
  }

  window.OH_GLB = {
    SPEC: SPEC, DIMS: DIMS, byId: byId,
    types: function(){ return Object.keys(SPEC); },
    list: function(type){ return SPEC[type] ? SPEC[type].items : []; },
    get: function(id){ return byId[id] || null; },
    defaultId: function(type){ return SPEC[type] ? SPEC[type].items[0].id : null; },
    // 보정 후 크기(m). 아직 계산 전이면 null.
    dims: function(id){ return DIMS[id] || null; },
    canLoad: canLoad,
    // 모양 하나를 불러와 보정된 인스턴스를 돌려줌 → { root, hinge, dims }
    load: function(id){
      var spec = byId[id]; if (!spec) return Promise.reject(new Error('unknown model ' + id));
      return fetchSrc(id).then(function(src){ var r = build(spec, src); DIMS[id] = DIMS[id] || r.dims; return r; });
    },
    isArch: function(id){ var o = byId[id]; return !!(o && o.arch); },
    lang: function(){ return (window.OH_I18N && window.OH_I18N.lang === 'en') ? 'en' : 'ko'; },
    label: function(id){ var s = byId[id]; return s ? (this.lang() === 'en' ? s.en : s.ko) : ''; }
  };
})();
