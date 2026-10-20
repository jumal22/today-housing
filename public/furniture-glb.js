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
  // fit: ['w'|'h'|'d', 미터] → 보정 후 그 축 길이를 맞추고 비율 유지. thick: 깊이(z, m) 강제, hh: 높이(y, m) 강제 — 비율을 일부러 바꿀 때만 씀.
  // rot: 원본의 앞면을 사이트 규칙에 맞추려고 y축으로 돌리는 각도. mount: floor | door | center | ceiling
  var SPEC = {
    sofa: { mount:'floor', items:[
      { id:'sofa_01', ko:'2인 소파',      en:'Loveseat',        rot:PI, fit:['w',1.75] },
      { id:'sofa_02', ko:'카우치 소파',   en:'Chaise sofa',     rot:PI, fit:['w',1.75] },
      { id:'sofa_03', ko:'코너 소파',     en:'Corner sofa',     rot:PI, fit:['w',1.75] },
      { id:'sofa_04', ko:'라운지 소파',   en:'Lounge sofa',     rot:PI, fit:['w',1.9] },
      { id:'sofa_05', ko:'라운지 코너 소파', en:'Lounge corner sofa', rot:PI, fit:['w',2.0] } ] },
    table: { mount:'floor', items:[
      { id:'table_01', ko:'식탁',          en:'Dining table',    rot:PI, fit:['w',1.6], hh:0.73 },
      { id:'table_02', ko:'원형 테이블',   en:'Pedestal table',  rot:PI, fit:['w',1.0], thick:1.0 },
      { id:'table_03', ko:'X다리 테이블',  en:'Cross-leg table', rot:PI, fit:['w',1.6], hh:0.73 },
      { id:'table_04', ko:'커피 테이블',   en:'Coffee table',    rot:PI, fit:['w',1.0] },
      { id:'table_05', ko:'유리 커피 테이블', en:'Glass coffee table', rot:PI, fit:['w',0.6] } ] },
    bed: { mount:'floor', items:[
      { id:'bed_01', ko:'더블 침대',  en:'Double bed',  rot:PI, fit:['d',2.0] },
      { id:'bed_02', ko:'싱글 침대',  en:'Single bed',  rot:PI, fit:['d',2.0] },
      { id:'bed_03', ko:'2층 침대',   en:'Bunk bed',    rot:PI, fit:['d',2.0] },
      { id:'bed_04', ko:'킹 침대',    en:'King bed',    rot:PI, fit:['d',2.1] },
      { id:'bed_05', ko:'클래식 침대', en:'Classic bed', rot:PI, fit:['d',2.1] } ] },
    plant: { mount:'floor', items:[
      { id:'plant_01', ko:'화분',        en:'Potted plant',   rot:PI, fit:['h',0.8] },
      { id:'plant_02', ko:'작은 화분 A', en:'Small plant A',  rot:PI, fit:['h',0.4] },
      { id:'plant_03', ko:'작은 화분 B', en:'Small plant B',  rot:PI, fit:['h',0.4] },
      { id:'plant_04', ko:'작은 화분 C', en:'Small plant C',  rot:PI, fit:['h',0.4] },
      { id:'plant_05', ko:'관엽식물',    en:'Houseplant',     rot:PI, fit:['w',0.85] },
      { id:'plant_06', ko:'작은 식물', en:'Small plant', rot:PI, fit:['h',0.5] },
      { id:'plant_08', ko:'선인장', en:'Cactus', rot:PI, fit:['h',0.5] },
      { id:'plant_09', ko:'관엽식물 B', en:'Houseplant B', rot:PI, fit:['w',0.8] },
      { id:'plant_10', ko:'관엽식물 C', en:'Houseplant C', rot:PI, fit:['h',0.8] } ] },
    door: { mount:'door', items:[
      { id:'door_01', ko:'나무 문',     en:'Wood door',      rot:0,    fit:['h',2.05], thick:0.14, hinge:'door' },
      { id:'door_02', ko:'유리창 문',   en:'Glass-panel door', rot:0,  fit:['h',2.05], thick:0.14, hinge:'door' },
      { id:'door_03', ko:'판넬 문',     en:'Panel door',     rot:PI/2, fit:['h',2.05], thick:0.14, hinge:'all' },
      { id:'door_04', ko:'유리 판넬 문', en:'Panel door with glass', rot:PI/2, fit:['h',2.05], thick:0.14, hinge:'all' },
      { id:'door_05', ko:'아치 문',     en:'Arched door',    rot:PI/2, fit:['h',2.05], thick:0.14, hinge:'all', arch:true } ] },
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
      { id:'ceiling_light_05', ko:'원형 천장등', en:'Round ceiling light',  rot:0, fit:['h',0.35] },
      { id:'ceiling_light_06', ko:'샹들리에', en:'Chandelier', rot:0, fit:['w',0.7] },
      { id:'ceiling_light_07', ko:'큐브 조명', en:'Cube light', rot:0, fit:['h',0.35] },
      { id:'ceiling_light_08', ko:'다면체 조명', en:'Faceted light', rot:0, fit:['h',0.5] },
      { id:'ceiling_light_09', ko:'천장 선풍기', en:'Ceiling fan', rot:0, fit:['w',1.1], spin:'y' } ] },
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
      { id:'table_lamp_05', ko:'클래식 탁상등', en:'Classic table lamp', rot:0, fit:['h',0.42] } ] },
    // ---- 2026-10 추가: 가구 탭 ----
    chair: { mount:'floor', items:[
      { id:'chair_01', ko:'기본 의자',     en:'Chair',            rot:0, fit:['h',0.9] },
      { id:'chair_02', ko:'쿠션 의자',     en:'Cushion chair',    rot:0, fit:['h',0.9] },
      { id:'chair_03', ko:'둥근 의자',     en:'Rounded chair',    rot:0, fit:['h',0.9] },
      { id:'chair_04', ko:'라운지 의자',   en:'Lounge chair',     rot:0, fit:['h',0.8] },
      { id:'chair_05', ko:'나무 의자',     en:'Wooden chair',     rot:0, fit:['h',0.9] },
      { id:'chair_06', ko:'사무용 의자', en:'Office chair', rot:0, fit:['h',1.0] } ] },
    stool: { mount:'floor', items:[
      { id:'stool_01', ko:'바 스툴',       en:'Bar stool',        rot:0, fit:['h',0.75] },
      { id:'stool_02', ko:'오토만',     en:'Ottoman',     rot:0, fit:['w',0.6] },
      { id:'stool_03', ko:'등받이 벤치',   en:'Bench with back',            rot:0, fit:['h',0.9] },
      { id:'stool_04', ko:'낮은 쿠션 벤치',     en:'Low cushion bench',    rot:0, fit:['w',0.9] },
      { id:'stool_05', ko:'스툴',          en:'Stool',            rot:PI, fit:['h',0.65] } ] },
    desk: { mount:'floor', items:[
      { id:'desk_01', ko:'책상',           en:'Desk',             rot:PI, fit:['w',1.4] },
      { id:'desk_02', ko:'코너 책상',      en:'Corner desk',      rot:PI, fit:['h',0.72] },
      { id:'desk_03', ko:'스탠딩 책상', en:'Standing desk', rot:PI, fit:['w',1.4], thick:0.75 },
      { id:'desk_04', ko:'높이조절 책상', en:'Adjustable desk', rot:PI, fit:['w',1.2] },
       ] },
    nightstand: { mount:'floor', items:[
      { id:'nightstand_01', ko:'사이드 테이블',   en:'Side table',          rot:PI, fit:['w',0.6], hh:0.5, thick:0.4 },
      { id:'nightstand_02', ko:'서랍 사이드 테이블', en:'Side table w/ drawers', rot:PI, fit:['w',0.6], hh:0.5, thick:0.4 },
      { id:'nightstand_03', ko:'협탁 A',          en:'Nightstand A',        rot:PI, fit:['h',0.55] },
      { id:'nightstand_04', ko:'협탁 B',          en:'Nightstand B',        rot:PI, fit:['h',0.55] },
      { id:'nightstand_05', ko:'협탁 C',          en:'Nightstand C',        rot:PI, fit:['h',0.55] } ] },
    bookcase: { mount:'floor', items:[
      { id:'bookcase_01', ko:'오픈 책장',     en:'Open bookcase',     rot:PI, fit:['h',1.75] },
      { id:'bookcase_02', ko:'문 달린 책장',  en:'Bookcase with doors', rot:0, fit:['h',1.75] },
      { id:'bookcase_03', ko:'와이드 책장',   en:'Wide bookcase',     rot:0, fit:['w',1.6] },
      { id:'bookcase_04', ko:'큰 선반',       en:'Large shelf',       rot:PI, fit:['h',1.8] },
      { id:'bookcase_05', ko:'작은 선반',     en:'Small shelf',       rot:PI, fit:['w',1.4] },
      { id:'bookcase_06', ko:'중형 책장', en:'Medium bookshelf', rot:PI, fit:['h',1.4] } ] },
    drawer: { mount:'floor', items:[
      { id:'drawer_01', ko:'서랍장 A', en:'Dresser A', rot:PI, fit:['h',0.7] },
      { id:'drawer_02', ko:'서랍장 B', en:'Dresser B', rot:PI, fit:['h',0.55] },
      { id:'drawer_03', ko:'서랍장 C', en:'Dresser C', rot:PI, fit:['h',0.9] },
      { id:'drawer_04', ko:'서랍장 D', en:'Dresser D', rot:PI, fit:['h',0.45] },
      { id:'drawer_05', ko:'서랍장 E', en:'Dresser E', rot:PI, fit:['h',0.65] },
      { id:'drawer_06', ko:'TV 장식장', en:'TV cabinet', rot:PI, fit:['w',1.4] },
      { id:'drawer_07', ko:'문 달린 TV 장식장', en:'TV cabinet w/ doors', rot:PI, fit:['w',1.4] } ] },
    // ==== batch2 start (욕실·가전·소품·벽 장식) ====
    toilet: { mount:'floor', items:[
      { id:'toilet_01', ko:'양변기', en:'Toilet', rot:0, fit:['h',0.75] },
      { id:'toilet_02', ko:'각진 양변기', en:'Square toilet', rot:0, fit:['h',0.75] },
      { id:'toilet_03', ko:'클래식 양변기', en:'Classic toilet', rot:PI, fit:['h',0.75] } ] },
    bathtub: { mount:'floor', items:[
      { id:'bathtub_01', ko:'욕조', en:'Bathtub', rot:0, fit:['w',1.6] },
      { id:'bathtub_02', ko:'클래식 욕조', en:'Classic bathtub', rot:PI/2, fit:['w',1.6] },
      { id:'bathtub_03', ko:'샤워 부스', en:'Shower stall', rot:0, fit:['h',2.1] } ] },
    bathsink: { mount:'floor', items:[
      { id:'bathsink_01', ko:'세면대', en:'Sink', rot:0, fit:['h',0.85] },
      { id:'bathsink_02', ko:'각진 세면대', en:'Square sink', rot:0, fit:['h',0.85] },
      { id:'bathsink_03', ko:'클래식 세면대', en:'Classic sink', rot:PI, fit:['h',0.85] },
      { id:'bathsink_04', ko:'서랍 욕실장', en:'Vanity with drawers', rot:0, fit:['w',0.9] } ] },
    fridge: { mount:'floor', items:[
      { id:'fridge_01', ko:'냉장고', en:'Fridge', rot:0, fit:['h',1.8] },
      { id:'fridge_02', ko:'큰 냉장고', en:'Large fridge', rot:0, fit:['h',1.78] },
      { id:'fridge_03', ko:'작은 냉장고', en:'Small fridge', rot:0, fit:['h',0.9] },
      { id:'fridge_04', ko:'빌트인 냉장고', en:'Built-in fridge', rot:0, fit:['h',1.8], thick:0.7 },
      { id:'fridge_05', ko:'클래식 냉장고', en:'Classic fridge', rot:PI, fit:['h',1.8] } ] },
    kitchen: { mount:'floor', items:[
      { id:'kitchen_01', ko:'싱크대', en:'Kitchen sink', rot:0, fit:['w',0.8], hh:0.87, thick:0.6 },
      { id:'kitchen_02', ko:'클래식 싱크대', en:'Classic kitchen sink', rot:PI, fit:['h',0.9] },
      { id:'kitchen_03', ko:'가스레인지', en:'Stove', rot:0, fit:['w',0.8], hh:0.87, thick:0.6 },
      { id:'kitchen_04', ko:'인덕션', en:'Induction stove', rot:0, fit:['w',0.8], hh:0.87, thick:0.6 },
      { id:'kitchen_05', ko:'오븐', en:'Oven', rot:PI, fit:['h',1.0] } ] },
    counter: { mount:'floor', items:[
      { id:'counter_01', ko:'주방 수납장', en:'Kitchen cabinet', rot:0, fit:['w',0.8], hh:0.87, thick:0.6 },
      { id:'counter_02', ko:'서랍 수납장', en:'Drawer cabinet', rot:0, fit:['w',0.8], hh:0.87, thick:0.6 },
      { id:'counter_03', ko:'코너 수납장', en:'Corner cabinet', rot:0, fit:['w',0.9], hh:0.87 },
      { id:'counter_04', ko:'주방 바', en:'Kitchen bar', rot:0, fit:['w',0.9] },
      { id:'counter_05', ko:'코너 수납장 B', en:'Corner cabinet B', rot:0, fit:['w',0.9], hh:0.87 } ] },
    laundry: { mount:'floor', items:[
      { id:'laundry_01', ko:'세탁기', en:'Washer', rot:0, fit:['h',0.85] },
      { id:'laundry_02', ko:'건조기', en:'Dryer', rot:0, fit:['h',0.85] },
      { id:'laundry_03', ko:'드럼 세탁기', en:'Front-load washer', rot:PI, fit:['h',0.85] } ] },
    smallapp: { mount:'floor', items:[
      { id:'smallapp_01', ko:'전자레인지', en:'Microwave', rot:0, fit:['w',0.45] },
      { id:'smallapp_02', ko:'토스터', en:'Toaster', rot:0, fit:['w',0.3] },
      { id:'smallapp_03', ko:'커피머신', en:'Coffee machine', rot:0, fit:['h',0.35] },
      { id:'smallapp_04', ko:'노트북', en:'Laptop', rot:0, fit:['w',0.35] },
      { id:'smallapp_05', ko:'모니터', en:'Monitor', rot:0, fit:['w',0.55] },
      { id:'smallapp_06', ko:'선풍기', en:'Desk fan', rot:PI, fit:['h',0.4], spin:'z' } ] },
    rug: { mount:'floor', items:[
      { id:'rug_01', ko:'직사각 러그', en:'Rectangular rug', rot:0, fit:['w',2.0] },
      { id:'rug_02', ko:'둥근 모서리 러그', en:'Rounded rug', rot:0, fit:['w',2.0] },
      { id:'rug_03', ko:'정사각 러그', en:'Square rug', rot:0, fit:['w',1.6] },
      { id:'rug_04', ko:'원형 러그', en:'Round rug', rot:0, fit:['w',1.4] },
      { id:'rug_05', ko:'패브릭 러그', en:'Fabric rug', rot:0, fit:['w',1.4] } ] },
    trash: { mount:'floor', items:[
      { id:'trash_01', ko:'쓰레기통', en:'Trash can', rot:0, fit:['h',0.5] },
      { id:'trash_02', ko:'클래식 쓰레기통', en:'Classic trash can', rot:PI, fit:['h',0.5] },
      { id:'trash_03', ko:'작은 쓰레기통', en:'Small trash can', rot:PI, fit:['h',0.35] },
      { id:'trash_04', ko:'큰 쓰레기통', en:'Large trash can', rot:PI, fit:['h',0.7] },
      { id:'trash_05', ko:'뚜껑 쓰레기통', en:'Lidded trash can', rot:PI, fit:['h',0.5] } ] },
    ornament: { mount:'floor', items:[
      { id:'ornament_01', ko:'스탠드 옷걸이', en:'Coat stand', rot:0, fit:['h',1.7] },
      { id:'ornament_02', ko:'벽난로', en:'Fireplace', rot:PI, fit:['w',1.4], fire:{ x:0, y:0.34, z:0.05 } },
      { id:'ornament_03', ko:'라디오', en:'Radio', rot:0, fit:['w',0.4] },
      { id:'ornament_04', ko:'택배 상자', en:'Cardboard box', rot:0, fit:['w',0.5] },
      { id:'ornament_05', ko:'스피커', en:'Speaker', rot:0, fit:['h',0.9] },
      { id:'ornament_06', ko:'괘종시계', en:'Grandfather clock', rot:PI, fit:['h',1.8] } ] },
    couch: { mount:'floor', items:[
      { id:'couch_01', ko:'패브릭 암체어', en:'Fabric armchair', rot:PI, fit:['w',1.05] },
      { id:'couch_02', ko:'2~3인 소파', en:'2–3 seater', rot:PI, fit:['w',2.0] },
      { id:'couch_03', ko:'3인 소파', en:'3 seater', rot:PI, fit:['w',2.4] },
      { id:'couch_04', ko:'ㄱ자 소파', en:'L-shaped sofa', rot:PI, fit:['w',2.4] },
      { id:'couch_05', ko:'1인 라운지 체어', en:'Lounge chair', rot:PI, fit:['w',1.05] } ] },
    roundtable: { mount:'floor', items:[
      { id:'roundtable_01', ko:'타원 테이블', en:'Oval table', rot:PI, fit:['w',1.6], hh:0.72, thick:0.85 },
      { id:'roundtable_02', ko:'작은 원형 테이블', en:'Small round table', rot:PI, fit:['w',0.8] },
      { id:'roundtable_03', ko:'원형 사이드 테이블', en:'Round side table', rot:PI, fit:['w',0.6] },
      { id:'roundtable_04', ko:'원형 식탁', en:'Round dining table', rot:0, fit:['w',1.1], hh:0.72, thick:1.1 },
      { id:'roundtable_05', ko:'사각 커피 테이블', en:'Square coffee table', rot:0, fit:['w',0.8] } ] },
    walldeco: { mount:'center', items:[
      { id:'walldeco_01', ko:'거울', en:'Mirror', rot:PI, fit:['w',0.6], thick:0.1 },
      { id:'walldeco_02', ko:'거울 수납장', en:'Mirror cabinet', rot:PI, fit:['w',0.6], thick:0.15 },
      { id:'walldeco_03', ko:'수건걸이', en:'Towel rack', rot:PI, fit:['w',0.7] },
      { id:'walldeco_04', ko:'벽 옷걸이', en:'Wall coat rack', rot:PI, fit:['w',0.9], thick:0.18 } ] },
    wardrobe: { mount:'floor', items:[
      { id:'wardrobe_01', ko:'붙박이 옷장', en:'Closet', rot:PI, fit:['h',2.0] },
      { id:'wardrobe_02', ko:'낮은 옷장', en:'Short closet', rot:PI, fit:['h',1.2] },
      { id:'wardrobe_03', ko:'큰 옷장', en:'Large wardrobe', rot:PI, fit:['h',2.0] },
      { id:'wardrobe_04', ko:'중간 옷장', en:'Medium wardrobe', rot:PI, fit:['h',1.9] },
      { id:'wardrobe_05', ko:'작은 옷장', en:'Small wardrobe', rot:PI, fit:['h',1.7] } ] },
    mirror: { mount:'floor', items:[
      { id:'mirror_01', ko:'전신거울', en:'Full-length mirror', rot:PI, fit:['h',1.6] },
      { id:'mirror_02', ko:'스탠드 거울', en:'Standing mirror', rot:PI, fit:['h',1.5] } ] },
    climate: { mount:'floor', items:[
      { id:'climate_01', ko:'공기청정기', en:'Air purifier', rot:PI, fit:['h',0.6] },
      { id:'climate_02', ko:'히터', en:'Heater', rot:PI, fit:['h',0.6] } ] },
    aircon: { mount:'center', items:[
      { id:'aircon_01', ko:'벽걸이 에어컨 A', en:'Wall A/C A', rot:0, fit:['w',0.85] },
      { id:'aircon_02', ko:'벽걸이 에어컨 B', en:'Wall A/C B', rot:0, fit:['w',0.85] },
      { id:'aircon_03', ko:'벽걸이 에어컨 C', en:'Wall A/C C', rot:0, fit:['w',0.9] } ] },
    wallart: { mount:'center', items:[
      { id:'wallart_01', ko:'세로 액자 (검정)', en:'Portrait frame (black)', rot:0, fit:['w',0.5] },
      { id:'wallart_02', ko:'가로 액자 (우드)', en:'Landscape frame (wood)', rot:0, fit:['w',0.8] },
      { id:'wallart_03', ko:'정사각 액자 (흰색)', en:'Square frame (white)', rot:0, fit:['w',0.5] },
      { id:'wallart_04', ko:'큰 액자 (골드)', en:'Large frame (gold)', rot:0, fit:['w',0.7] },
      { id:'wallart_05', ko:'작은 액자 (갈색)', en:'Small frame (brown)', rot:0, fit:['w',0.3] },
      { id:'wallart_06', ko:'와이드 액자 (검정)', en:'Wide frame (black)', rot:0, fit:['w',1.2] } ] },
    standac: { mount:'floor', items:[
      { id:'standac_01', ko:'스탠드 에어컨', en:'Floor A/C', rot:PI, fit:['h',1.7] } ] }
    // ==== batch2 end ====
  };
  // 보정 후 크기(m) {w,h,d} — tools/ 의 계산 스크립트가 채움. 로드 전에도 동기적으로 baseSize 를 알려고 미리 넣어둠.
  var DIMS = /*DIMS*/{"sofa_01":{"w":1.75,"h":0.821,"d":0.732},"sofa_02":{"w":1.75,"h":0.821,"d":1.464},"sofa_03":{"w":1.75,"h":0.821,"d":1.75},"sofa_04":{"w":1.9,"h":0.679,"d":0.696},"sofa_05":{"w":2,"h":0.593,"d":2},"table_01":{"w":1.6,"h":0.73,"d":0.851},"table_02":{"w":1,"h":0.529,"d":1},"table_03":{"w":1.6,"h":0.73,"d":0.84},"table_04":{"w":1,"h":0.348,"d":0.605},"table_05":{"w":0.6,"h":0.345,"d":0.6},"bed_01":{"w":1.7,"h":0.667,"d":2.0},"bed_02":{"w":1.015,"h":0.667,"d":2.0},"bed_03":{"w":1.043,"h":1.553,"d":2},"bed_04":{"w":1.628,"h":0.645,"d":2.1},"bed_05":{"w":1.394,"h":0.768,"d":2.1},"plant_01":{"w":0.259,"h":0.8,"d":0.295},"plant_02":{"w":0.27,"h":0.4,"d":0.27},"plant_03":{"w":0.27,"h":0.4,"d":0.27},"plant_04":{"w":0.27,"h":0.4,"d":0.234},"plant_05":{"w":0.85,"h":0.643,"d":0.889},"door_01":{"w":0.987,"h":2.05,"d":0.14},"door_02":{"w":0.987,"h":2.05,"d":0.14},"door_03":{"w":0.903,"h":2.05,"d":0.14},"door_04":{"w":0.903,"h":2.05,"d":0.14},"door_05":{"w":0.903,"h":2.05,"d":0.14},"window_01":{"w":0.745,"h":1.2,"d":0.11},"window_02":{"w":0.745,"h":1.2,"d":0.11},"window_03":{"w":1.021,"h":1.3,"d":0.11},"window_04":{"w":2,"h":0.903,"d":0.11},"window_05":{"w":1.021,"h":1.3,"d":0.11},"outlet_02":{"w":0.073,"h":0.12,"d":0.02},"outlet_03":{"w":0.14,"h":0.082,"d":0.02},"tv_01":{"w":1.1,"h":0.73,"d":0.206},"tv_02":{"w":0.6,"h":0.395,"d":0.395},"tv_03":{"w":1.2,"h":0.742,"d":0.117},"tv_04":{"w":1.2,"h":0.706,"d":0.12},"tv_05":{"w":1.2,"h":0.804,"d":0.107},"ceiling_light_01":{"w":0.13,"h":0.25,"d":0.13},"ceiling_light_02":{"w":0.25,"h":0.7,"d":0.247},"ceiling_light_03":{"w":0.322,"h":0.6,"d":0.318},"ceiling_light_04":{"w":0.479,"h":0.8,"d":0.479},"ceiling_light_05":{"w":0.193,"h":0.35,"d":0.203},"floor_lamp_01":{"w":0.256,"h":1.45,"d":0.296},"floor_lamp_02":{"w":0.202,"h":1.45,"d":0.202},"floor_lamp_03":{"w":0.28,"h":1.6,"d":0.295},"floor_lamp_04":{"w":0.439,"h":1.7,"d":0.462},"floor_lamp_05":{"w":0.627,"h":1.4,"d":0.659},"table_lamp_01":{"w":0.203,"h":0.42,"d":0.235},"table_lamp_02":{"w":0.174,"h":0.42,"d":0.174},"table_lamp_03":{"w":0.197,"h":0.45,"d":0.356},"table_lamp_04":{"w":0.23,"h":0.5,"d":0.23},"table_lamp_05":{"w":0.203,"h":0.42,"d":0.203},"window_06":{"w":1.2,"h":1.1,"d":0.09},"chair_01":{"w":0.383,"h":0.9,"d":0.383},"chair_02":{"w":0.391,"h":0.9,"d":0.391},"chair_03":{"w":0.396,"h":0.9,"d":0.396},"chair_04":{"w":0.852,"h":0.8,"d":0.713},"chair_05":{"w":0.388,"h":0.9,"d":0.42},"stool_01":{"w":0.458,"h":0.75,"d":0.396},"stool_02":{"w":0.6,"h":0.314,"d":0.614},"stool_03":{"w":0.766,"h":0.9,"d":0.383},"stool_04":{"w":0.9,"h":0.429,"d":0.471},"stool_05":{"w":0.32,"h":0.65,"d":0.336},"desk_01":{"w":1.4,"h":0.733,"d":0.748},"desk_02":{"w":1.825,"h":0.72,"d":1.825},"nightstand_01":{"w":0.6,"h":0.5,"d":0.4},"nightstand_02":{"w":0.6,"h":0.5,"d":0.4},"nightstand_03":{"w":0.554,"h":0.55,"d":0.554},"nightstand_04":{"w":0.635,"h":0.55,"d":0.635},"nightstand_05":{"w":0.633,"h":0.55,"d":0.633},"bookcase_01":{"w":0.795,"h":1.75,"d":0.497},"bookcase_02":{"w":0.824,"h":1.75,"d":0.515},"bookcase_03":{"w":1.6,"h":1.58,"d":0.5},"bookcase_04":{"w":1.371,"h":1.8,"d":0.307},"bookcase_05":{"w":1.4,"h":0.416,"d":0.396},"drawer_01":{"w":1.446,"h":0.7,"d":0.579},"drawer_02":{"w":1.448,"h":0.55,"d":0.466},"drawer_03":{"w":1.215,"h":0.9,"d":0.486},"drawer_04":{"w":1.392,"h":0.45,"d":0.386},"drawer_05":{"w":1.363,"h":0.65,"d":0.562},"couch_01":{"w":1.05,"h":0.695,"d":0.802},"couch_02":{"w":2,"h":0.867,"d":0.885},"couch_03":{"w":2.4,"h":0.923,"d":0.873},"couch_04":{"w":2.4,"h":0.967,"d":1.85},"couch_05":{"w":1.05,"h":0.63,"d":0.99},"roundtable_01":{"w":1.6,"h":0.72,"d":0.85},"roundtable_02":{"w":0.8,"h":0.498,"d":0.8},"roundtable_03":{"w":0.6,"h":0.355,"d":0.6},"roundtable_04":{"w":1.1,"h":0.72,"d":1.1},"roundtable_05":{"w":0.8,"h":0.46,"d":0.8},"toilet_01":{"w":0.52,"h":0.75,"d":0.794},"toilet_02":{"w":0.505,"h":0.75,"d":0.644},"toilet_03":{"w":0.472,"h":0.75,"d":0.667},"bathtub_01":{"w":1.6,"h":0.565,"d":0.753},"bathtub_02":{"w":1.6,"h":0.517,"d":0.66},"bathtub_03":{"w":1.078,"h":2.1,"d":1.078},"bathsink_01":{"w":0.516,"h":0.85,"d":0.44},"bathsink_02":{"w":0.63,"h":0.85,"d":0.44},"bathsink_03":{"w":0.816,"h":0.85,"d":0.479},"bathsink_04":{"w":0.9,"h":0.987,"d":0.67},"fridge_01":{"w":0.841,"h":1.8,"d":0.571},"fridge_02":{"w":1.006,"h":1.78,"d":0.785},"fridge_03":{"w":0.645,"h":0.9,"d":0.438},"fridge_04":{"w":0.891,"h":1.8,"d":0.7},"fridge_05":{"w":0.706,"h":1.8,"d":0.708},"kitchen_01":{"w":0.8,"h":0.87,"d":0.6},"kitchen_02":{"w":0.473,"h":0.9,"d":0.524},"kitchen_03":{"w":0.8,"h":0.87,"d":0.6},"kitchen_04":{"w":0.8,"h":0.87,"d":0.6},"kitchen_05":{"w":0.735,"h":1.0,"d":0.672},"counter_01":{"w":0.8,"h":0.87,"d":0.6},"counter_02":{"w":0.8,"h":0.87,"d":0.6},"counter_03":{"w":0.9,"h":0.87,"d":0.9},"counter_04":{"w":0.9,"h":0.879,"d":0.44},"counter_05":{"w":0.9,"h":0.87,"d":0.9},"laundry_01":{"w":0.705,"h":0.85,"d":0.705},"laundry_02":{"w":0.705,"h":0.85,"d":0.687},"laundry_03":{"w":0.747,"h":0.85,"d":0.765},"smallapp_01":{"w":0.45,"h":0.279,"d":0.357},"smallapp_02":{"w":0.3,"h":0.207,"d":0.16},"smallapp_03":{"w":0.374,"h":0.35,"d":0.474},"smallapp_04":{"w":0.35,"h":0.215,"d":0.318},"smallapp_05":{"w":0.55,"h":0.412,"d":0.146},"rug_01":{"w":2.0,"h":0.013,"d":1.172},"rug_02":{"w":2.0,"h":0.013,"d":1.172},"rug_03":{"w":1.6,"h":0.018,"d":1.628},"rug_04":{"w":1.4,"h":0.015,"d":1.4},"rug_05":{"w":1.4,"h":0.024,"d":2.032},"trash_01":{"w":0.243,"h":0.5,"d":0.274},"trash_02":{"w":0.351,"h":0.5,"d":0.351},"trash_03":{"w":0.247,"h":0.35,"d":0.15},"trash_04":{"w":0.464,"h":0.7,"d":0.464},"trash_05":{"w":0.275,"h":0.5,"d":0.36},"ornament_01":{"w":0.602,"h":1.7,"d":0.602},"ornament_02":{"w":1.4,"h":1.103,"d":0.499},"ornament_03":{"w":0.4,"h":0.29,"d":0.124},"ornament_04":{"w":0.5,"h":0.661,"d":0.5},"ornament_05":{"w":0.209,"h":0.9,"d":0.209},"walldeco_01":{"w":0.6,"h":0.865,"d":0.1},"walldeco_02":{"w":0.6,"h":1.017,"d":0.15},"walldeco_03":{"w":0.7,"h":0.386,"d":0.095},"walldeco_04":{"w":0.9,"h":0.562,"d":0.18},"drawer_06":{"w":1.4,"h":0.542,"d":0.437},"drawer_07":{"w":1.4,"h":0.542,"d":0.455},"plant_06":{"w":0.338,"h":0.5,"d":0.338},"plant_08":{"w":0.203,"h":0.5,"d":0.2},"plant_09":{"w":0.8,"h":0.662,"d":0.826},"plant_10":{"w":0.291,"h":0.8,"d":0.291},"ceiling_light_06":{"w":0.7,"h":0.447,"d":0.7},"ceiling_light_07":{"w":0.191,"h":0.35,"d":0.191},"ceiling_light_08":{"w":0.285,"h":0.5,"d":0.272},"ceiling_light_09":{"w":1.1,"h":0.323,"d":1.27},"wardrobe_01":{"w":1.043,"h":2,"d":0.584},"wardrobe_02":{"w":0.822,"h":1.2,"d":0.48},"wardrobe_03":{"w":2.375,"h":2,"d":0.685},"wardrobe_04":{"w":1.747,"h":1.9,"d":0.718},"wardrobe_05":{"w":0.976,"h":1.7,"d":0.481},"mirror_01":{"w":0.706,"h":1.6,"d":0.526},"mirror_02":{"w":0.932,"h":1.5,"d":0.102},"climate_01":{"w":0.458,"h":0.6,"d":0.459},"climate_02":{"w":0.374,"h":0.6,"d":0.199},"aircon_01":{"w":0.85,"h":0.207,"d":0.118},"aircon_02":{"w":0.85,"h":0.207,"d":0.118},"wallart_01":{"w":0.5,"h":0.7,"d":0.03},"wallart_02":{"w":0.8,"h":0.55,"d":0.03},"wallart_03":{"w":0.5,"h":0.5,"d":0.03},"wallart_04":{"w":0.7,"h":1.0,"d":0.03},"wallart_05":{"w":0.3,"h":0.4,"d":0.03},"wallart_06":{"w":1.2,"h":0.5,"d":0.03},"desk_03":{"w":1.4,"h":1.21,"d":0.75},"desk_04":{"w":1.2,"h":0.798,"d":1.694},"chair_06":{"w":0.64,"h":1,"d":0.716},"bookcase_06":{"w":1.649,"h":1.4,"d":0.261},"smallapp_06":{"w":0.297,"h":0.4,"d":0.222},"ornament_06":{"w":0.4,"h":1.8,"d":0.293},"standac_01":{"w":0.519,"h":1.7,"d":0.279},"aircon_03":{"w":0.9,"h":0.257,"d":0.265}}/*END*/;
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

  // ===== 벽난로 불 효과 =====
  // 불꽃(Sprite 여러 장, 가산 합성) + 숯불 빛 번짐 + 장작 + 따뜻한 점광원. 꺼져 있을 땐 불꽃만 숨기고 광원은 세기 0으로 둠
  // (광원 개수가 바뀌면 모든 재질이 다시 컴파일돼서 버벅이므로 visible 은 항상 true).
  var fireTex = null;
  function getFireTex(THREE){
    if (fireTex) return fireTex;
    var c = document.createElement('canvas'); c.width = 64; c.height = 128; var x = c.getContext('2d');
    // 물방울 모양 불꽃: 아래가 넓고 위가 뾰족, 가운데는 밝은 노랑 → 주황 → 빨강으로 투명하게
    var g = x.createRadialGradient(32, 92, 2, 32, 86, 50);
    g.addColorStop(0, 'rgba(255,250,200,1)'); g.addColorStop(.25, 'rgba(255,200,70,.95)'); g.addColorStop(.6, 'rgba(255,110,20,.6)'); g.addColorStop(1, 'rgba(180,30,0,0)');
    x.fillStyle = g; x.beginPath(); x.moveTo(32, 2); x.bezierCurveTo(44, 40, 62, 70, 50, 104); x.bezierCurveTo(44, 124, 20, 124, 14, 104); x.bezierCurveTo(2, 70, 20, 40, 32, 2); x.closePath(); x.fill();
    fireTex = new THREE.CanvasTexture(c); return fireTex;
  }
  function makeFire(cfg, THREE){
    var group = new THREE.Group(); group.position.set(cfg.x || 0, cfg.y || 0, cfg.z || 0);
    var tex = getFireTex(THREE), flames = [];
    function noRay(o){ o.raycast = function(){}; return o; }
    // 장작 2개 (항상 보임 — 꺼져 있어도 그을린 장작이 있는 벽난로)
    var logMat = new THREE.MeshStandardMaterial({ color: 0x3b2616, roughness: 1 });
    [[-0.05, 0.035, 0.12], [0.07, 0.035, -0.18]].forEach(function(l){
      var m = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.42, 8), logMat);
      m.rotation.z = Math.PI / 2; m.rotation.y = l[2]; m.position.set(0, l[1], l[0]); m.userData.colorable = false; group.add(m);
    });
    var fx = new THREE.Group(); fx.visible = false; group.add(fx);
    var glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xff5a10, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: .5 }));
    glow.scale.set(0.7, 0.36, 1); glow.position.set(0, 0.1, 0.03); fx.add(noRay(glow));
    for (var i = 0; i < 7; i++){
      var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: i % 2 ? 0xffb050 : 0xff8a30, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: .9 }));
      var fxp = (i - 3) * 0.075; sp.position.set(fxp, 0.12, ((i * 37) % 5 - 2) * 0.012);
      sp.userData = { ph: i * 1.7, bx: fxp, h: 0.4 - Math.abs(i - 3) * 0.05 };
      fx.add(noRay(sp)); flames.push(sp);
    }
    var light = new THREE.PointLight(0xff7a2a, 0, 4, 1.6); light.position.set(0, 0.22, -0.5); group.add(light);
    return { group: group, fx: fx, flames: flames, glow: glow, light: light, on: false };
  }
  // 매 프레임 호출: on 이면 불꽃을 일렁이게, 아니면 숨기고 광원 0
  function fireUpdate(f, on, t){
    if (!f) return;
    f.fx.visible = !!on;
    if (!on){ f.light.intensity = 0; return; }
    for (var i = 0; i < f.flames.length; i++){
      var s = f.flames[i], u = s.userData, w = Math.sin(t * 7.3 + u.ph) * 0.5 + Math.sin(t * 12.1 + u.ph * 2.3) * 0.5;
      var h = u.h * (1 + 0.28 * w);
      s.scale.set(0.15 + 0.03 * w, h, 1); s.position.x = u.bx + Math.sin(t * 3.1 + u.ph) * 0.015; s.position.y = 0.04 + h * 0.5;
      s.material.opacity = 0.82 + 0.15 * Math.sin(t * 9 + u.ph);
    }
    f.glow.material.opacity = 0.45 + 0.1 * Math.sin(t * 5.2);
    f.light.intensity = 1.0 * (0.82 + 0.18 * Math.sin(t * 11.3) * Math.sin(t * 7.1 + 1.3) + 0.08 * Math.sin(t * 23));
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
      if (!o.material.transparent && key !== 'picture') area[key] = (area[key] || 0) + tri;
    });
    var best = null; Object.keys(area).forEach(function(k){ if (best == null || area[k] > area[best]) best = k; });
    inst.traverse(function(o){ if (!o.isMesh) return; o.userData.colorable = ((o.material.name || o.material.uuid) === best); if (o.material.name === 'picture') o.userData.picture = true; });
    holder.rotation.y = spec.rot || 0;
    holder.add(inst); scaler.add(holder); root.add(scaler);
    // 스케일은 회전 바깥(scaler)에 걸어서 '회전한 뒤의' 가로·세로·깊이 기준으로 적용
    root.updateMatrixWorld(true);
    var box = new THREE.Box3().setFromObject(scaler), size = box.getSize(new THREE.Vector3());
    var ax = spec.fit[0], s = spec.fit[1] / (ax === 'w' ? size.x : ax === 'h' ? size.y : size.z);
    scaler.scale.set(s, spec.hh ? spec.hh / size.y : s, spec.thick ? spec.thick / size.z : s);
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
    var fire = null;
    if (spec.fire){ fire = makeFire(spec.fire, THREE); root.add(fire.group); }
    var spin = null;
    if (spec.spin){          // 선풍기: 'spin' 노드(날개)를 날개 중심에 둔 회전축 그룹으로 옮김
      var sn = []; inst.traverse(function(o){ if (/^spin/i.test(o.name) && o.parent && !/^spin/i.test(o.parent.name)) sn.push(o); });
      if (sn.length){
        var sb = new THREE.Box3(); sn.forEach(function(o){ sb.expandByObject(o); });
        var sc = sn[0].getWorldPosition(new THREE.Vector3()), pv = new THREE.Group();   // 날개 노드의 원점 = 모델이 정한 회전 중심(bbox 중심은 날개 배치가 비대칭이라 허브와 어긋남)
        pv.position.copy(sc); root.add(pv); root.updateMatrixWorld(true);
        sn.forEach(function(o){ pv.attach(o); });
        spin = { node: pv, axis: spec.spin };
      }
    }
    return { root: root, hinge: hinge, spin: spin, fire: fire, dims: { w: size.x, h: size.y, d: size.z } };
  }

  window.OH_GLB = {
    SPEC: SPEC, DIMS: DIMS, byId: byId, fireUpdate: fireUpdate,
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
