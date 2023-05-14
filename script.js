window.focus(); // จับคีย์ทันที (โดยค่าเริ่มต้นโฟกัสอยู่ที่ตัวแก้ไข)

let camera, scene, renderer; // ThreeJS globals
let world; // CannonJs world
let lastTime; // เวลาล่าสุดของภาพเคลื่อนไหว
let stack; // ชิ้นส่วนวัตถุอยู่ด้านบนของกันและกัน
let overhangs; // ส่วนที่ยื่นจะตกลงมา
const boxHeight = 1; // ความสูงของแต่ละชั้น
const originalBoxSize = 3; // ความกว้างและความสูงดั้งเดิมของกล่อง
let autopilot;
let gameEnded;
let robotPrecision; // กำหนดความแม่นยำในระบบอัตโนมัติ

const scoreElement = document.getElementById("score");
const instructionsElement = document.getElementById("instructions");
const resultsElement = document.getElementById("results");

init();

// กำหนดความแม่นยำในระบบให้มันอัตโนมัติ
function setRobotPrecision() {
  robotPrecision = Math.random() * 1 - 0.5;
}

function init() {
  autopilot = true;
  gameEnded = false;
  lastTime = 0;
  stack = [];
  overhangs = [];
  setRobotPrecision();

  // เริ่มต้นการใช้ CannonJS
  world = new CANNON.World();
  world.gravity.set(0, -10, 0); // แรงโน้มถ่วงจะดึงสิ่งต่างๆลงมา
  world.broadphase = new CANNON.NaiveBroadphase();
  world.solver.iterations = 40;

  // เริ่มต้นการใช้ ThreeJs
  const aspect = window.innerWidth / window.innerHeight;
  const width = 10;
  const height = width / aspect;

  camera = new THREE.OrthographicCamera(
    width / -2, // ซ้าย
    width / 2, // ขวา
    height / 2, // บน
    height / -2, // ล่าง
    0, // ใกล้
    100 // ไกล
  );

  camera.position.set(4, 4, 4);
  camera.lookAt(0, 0, 0);

  scene = new THREE.Scene();

  addLayer(0, 0, originalBoxSize, originalBoxSize);

  addLayer(-10, 0, originalBoxSize, originalBoxSize, "x");

  // ติดตั้งไฟ
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
  dirLight.position.set(10, 20, 0);
  scene.add(dirLight);

  // ตั้งค่าเรนเดอร์
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setAnimationLoop(animation);
  document.body.appendChild(renderer.domElement);
}

function startGame() {
  autopilot = false;
  gameEnded = false;
  lastTime = 0;
  stack = [];
  overhangs = [];

  if (instructionsElement) instructionsElement.style.display = "none";
  if (resultsElement) resultsElement.style.display = "none";
  if (scoreElement) scoreElement.innerText = 0;

  if (world) {
    // ลบทุกวัตถุออกจากworld
    while (world.bodies.length > 0) {
      world.remove(world.bodies[0]);
    }
  }

  if (scene) {
    // นำวัตถุทั้งหมดออกจากฉาก
    while (scene.children.find((c) => c.type == "Mesh")) {
      const mesh = scene.children.find((c) => c.type == "Mesh");
      scene.remove(mesh);
    }

    // พื้นฐาน
    addLayer(0, 0, originalBoxSize, originalBoxSize);

    // ชั้นแรก
    addLayer(-10, 0, originalBoxSize, originalBoxSize, "x");
  }

  if (camera) {
    // รีเซ็ตตำแหน่งกล้อง
    camera.position.set(4, 4, 4);
    camera.lookAt(0, 0, 0);
  }
}

function addLayer(x, z, width, depth, direction) {
  const y = boxHeight * stack.length; // เพิ่มกล่องใหม่ให้สูงขึ้นหนึ่งชั้น
  const layer = generateBox(x, y, z, width, depth, false);
  layer.direction = direction;
  stack.push(layer);
}

function addOverhang(x, z, width, depth) {
  const y = boxHeight * (stack.length - 1); // เพิ่มกล่องใหม่หนึ่งชั้นเดียวกัน
  const overhang = generateBox(x, y, z, width, depth, true);
  overhangs.push(overhang);
}

function generateBox(x, y, z, width, depth, falls) {
  // ThreeJS
  const geometry = new THREE.BoxGeometry(width, boxHeight, depth);
  const color = new THREE.Color(`hsl(${30 + stack.length * 4}, 100%, 50%)`);
  const material = new THREE.MeshLambertMaterial({ color });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  scene.add(mesh);

  // CannonJS
  const shape = new CANNON.Box(
    new CANNON.Vec3(width / 2, boxHeight / 2, depth / 2)
  );
  let mass = falls ? 5 : 0; // ถ้ามันไม่ควรตกลงมา การตั้งค่าวัตถุให้เป็นศูนย์จะทำให้มันอยู่นิ่ง
  mass *= width / originalBoxSize; // ลดวัตถุตามสัดส่วนตามขนาด
  mass *= depth / originalBoxSize; // ลดวัตถุตามสัดส่วนตามขนาด
  const body = new CANNON.Body({ mass, shape });
  body.position.set(x, y, z);
  world.addBody(body);

  return {
    threejs: mesh,
    cannonjs: body,
    width,
    depth
  };
}

function cutBox(topLayer, overlap, size, delta) {
  const direction = topLayer.direction;
  const newWidth = direction == "x" ? overlap : topLayer.width;
  const newDepth = direction == "z" ? overlap : topLayer.depth;

  // อัปเดตข้อมูลเมตา
  topLayer.width = newWidth;
  topLayer.depth = newDepth;

  // Update ThreeJS model
  topLayer.threejs.scale[direction] = overlap / size;
  topLayer.threejs.position[direction] -= delta / 2;

  // Update CannonJS model
  topLayer.cannonjs.position[direction] -= delta / 2;

  // แทนที่รูปร่างให้เล็กลง
  const shape = new CANNON.Box(
    new CANNON.Vec3(newWidth / 2, boxHeight / 2, newDepth / 2)
  );
  topLayer.cannonjs.shapes = [];
  topLayer.cannonjs.addShape(shape);
}

window.addEventListener("mousedown", eventHandler);
window.addEventListener("touchstart", eventHandler);
window.addEventListener("keydown", function (event) {
  if (event.key == " ") {
    event.preventDefault();
    eventHandler();
    return;
  }
  if (event.key == "R" || event.key == "r") {
    event.preventDefault();
    startGame();
    return;
  }
});

function eventHandler() {
  if (autopilot) startGame();
  else splitBlockAndAddNextOneIfOverlaps();
}

function splitBlockAndAddNextOneIfOverlaps() {
  if (gameEnded) return;

  const topLayer = stack[stack.length - 1];
  const previousLayer = stack[stack.length - 2];

  const direction = topLayer.direction;

  const size = direction == "x" ? topLayer.width : topLayer.depth;
  const delta =
    topLayer.threejs.position[direction] -
    previousLayer.threejs.position[direction];
  const overhangSize = Math.abs(delta);
  const overlap = size - overhangSize;

  if (overlap > 0) {
    cutBox(topLayer, overlap, size, delta);

    // Overhang
    const overhangShift = (overlap / 2 + overhangSize / 2) * Math.sign(delta);
    const overhangX =
      direction == "x"
        ? topLayer.threejs.position.x + overhangShift
        : topLayer.threejs.position.x;
    const overhangZ =
      direction == "z"
        ? topLayer.threejs.position.z + overhangShift
        : topLayer.threejs.position.z;
    const overhangWidth = direction == "x" ? overhangSize : topLayer.width;
    const overhangDepth = direction == "z" ? overhangSize : topLayer.depth;

    addOverhang(overhangX, overhangZ, overhangWidth, overhangDepth);

    // ชั้นถัดไป
    const nextX = direction == "x" ? topLayer.threejs.position.x : -10;
    const nextZ = direction == "z" ? topLayer.threejs.position.z : -10;
    const newWidth = topLayer.width; // เลเยอร์ใหม่มีขนาดเท่ากับเลเยอร์บนสุดที่ตัด
    const newDepth = topLayer.depth; // เลเยอร์ใหม่มีขนาดเท่ากับเลเยอร์บนสุดที่ตัด
    const nextDirection = direction == "x" ? "z" : "x";

    if (scoreElement) scoreElement.innerText = stack.length - 1;
    addLayer(nextX, nextZ, newWidth, newDepth, nextDirection);
  } else {
    missedTheSpot();
  }
}

function missedTheSpot() {
  const topLayer = stack[stack.length - 1];

  // พลิกชั้นบนสุดเป็นส่วนที่ยื่นออกมาแล้วปล่อยให้ตกลงมา
  addOverhang(
    topLayer.threejs.position.x,
    topLayer.threejs.position.z,
    topLayer.width,
    topLayer.depth
  );
  world.remove(topLayer.cannonjs);
  scene.remove(topLayer.threejs);

  gameEnded = true;
  if (resultsElement && !autopilot) resultsElement.style.display = "flex";
}

function animation(time) {
  if (lastTime) {
    const timePassed = time - lastTime;
    const speed = 0.008;

    const topLayer = stack[stack.length - 1];
    const previousLayer = stack[stack.length - 2];

    // ช่องระดับบนสุดควรย้ายหากเกมยังไม่จบ
    const boxShouldMove =
      !gameEnded &&
      (!autopilot ||
        (autopilot &&
          topLayer.threejs.position[topLayer.direction] <
            previousLayer.threejs.position[topLayer.direction] +
              robotPrecision));

    if (boxShouldMove) {
      // ตัั้งค่าตำแหน่งที่มองเห็นได้บน UI และตำแหน่งในโมเดลให้ตรงกัน
      topLayer.threejs.position[topLayer.direction] += speed * timePassed;
      topLayer.cannonjs.position[topLayer.direction] += speed * timePassed;

      // กล่องเกินกองให้แสดงหน้าจอล้มเหลว
      if (topLayer.threejs.position[topLayer.direction] > 10) {
        missedTheSpot();
      }
    } else {
      // ถ้ามันไม่ควรเคลื่อนที่ นั่นเป็นเพราะระบบขับเคลื่อนอัตโนมัติมาถึงตำแหน่งที่ถูกต้อง
      if (autopilot) {
        splitBlockAndAddNextOneIfOverlaps();
        setRobotPrecision();
      }
    }

    // 4 คือความสูงของกล้องเริ่มต้น
    if (camera.position.y < boxHeight * (stack.length - 2) + 4) {
      camera.position.y += speed * timePassed;
    }

    updatePhysics(timePassed);
    renderer.render(scene, camera);
  }
  lastTime = time;
}

function updatePhysics(timePassed) {
  world.step(timePassed / 1000);

  // คัดลอกพิกัดจาก Cannon.js ไปยัง Three.js
  overhangs.forEach((element) => {
    element.threejs.position.copy(element.cannonjs.position);
    element.threejs.quaternion.copy(element.cannonjs.quaternion);
  });
}

window.addEventListener("resize", () => {
  // ปรับกล้อง
  console.log("resize", window.innerWidth, window.innerHeight);
  const aspect = window.innerWidth / window.innerHeight;
  const width = 10;
  const height = width / aspect;

  camera.top = height / 2;
  camera.bottom = height / -2;

  // รีเซ็ตตัวเรนเดอร์
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.render(scene, camera);
});
