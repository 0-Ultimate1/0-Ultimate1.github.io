import * as THREE from 'three';

const SKIN = 0x7c5c46;
const JACKET = 0x1d1d22;
const PANTS = 0x151518;
const SHOE = 0x0a0a0b;
const GOLD = 0xd0a84c;
const HAIR = 0x4a3626;
const CAP = 0x18181b;

// R6 style: every arm and leg is one solid block, so there are no elbow or knee angles
export const POSE_KEYS = [
	'y', 'twist', 'roll', 'lean', 'headX', 'headY',
	'aShX', 'aShY', 'aShZ', 'bShX', 'bShY', 'bShZ',
	'aHip', 'aHipZ', 'bHip', 'bHipZ',
];

export function zeroPose() {
	const p = {};
	for (const k of POSE_KEYS) p[k] = 0;
	return p;
}

// adds pose * weight on top of what is already in target
export function addPose(target, pose, w) {
	if (w <= 0) return;
	for (const k in pose) target[k] += pose[k] * w;
}

export const Poses = {
	// relaxed, weight on one leg
	cool(t) {
		const b = Math.sin(t * 1.3);
		return { roll: 0.03, lean: -0.03 + b * 0.006, aHipZ: -0.08, bHipZ: 0.05, aShZ: -0.09 - b * 0.012, bShZ: 0.09 + b * 0.012, aShX: 0.05, bShX: 0.05 };
	},
	// hands by the pockets, chin down
	pockets(t) {
		const b = Math.sin(t * 1.3);
		return { roll: 0.035, twist: 0.12, lean: -0.07 + b * 0.006, aHipZ: -0.1, bHipZ: 0.06, bHip: -0.1, aShX: 0.12, bShX: 0.1, aShZ: 0.05, bShZ: -0.05, headX: 0.13, headY: -0.14 };
	},
	stance(t) {
		const b = Math.sin(t * 2.2);
		return { y: -0.1 + b * 0.015, twist: 0.35, lean: 0.1, aHip: -0.38, bHip: 0.32, aShX: -0.75, bShX: -0.35, aShZ: -0.2, bShZ: 0.25, headY: -0.3 };
	},
	run(ph) {
		const s = Math.sin(ph);
		return { y: -0.05 - Math.cos(ph * 2) * 0.06, lean: 0.2, twist: s * 0.1, aHip: -s * 0.9, bHip: s * 0.9, aShX: s * 1.0, bShX: -s * 1.0, aShZ: -0.06, bShZ: 0.06 };
	},
	walk(ph) {
		const s = Math.sin(ph);
		return { y: -0.02, lean: 0.04, aHip: -s * 0.45, bHip: s * 0.45, aShX: s * 0.4, bShX: -s * 0.4, aShZ: -0.05, bShZ: 0.05 };
	},
	jump: { lean: 0.08, aHip: -0.25, bHip: 0.2, aHipZ: -0.12, bHipZ: 0.12, aShX: -2.7, bShX: -2.9, aShZ: -0.25, bShZ: 0.25 },
	// low lunge under a high attack
	duck: { y: -0.9, lean: 0.95, aHip: -1.0, bHip: 0.95, aShX: 0.9, bShX: -1.9, headX: -0.5 },
	sideA: { roll: 0.42, y: -0.12, aHipZ: -0.6, bHipZ: 0.2, aShZ: -1.1, bShZ: 0.5 },
	sideB: { roll: -0.42, y: -0.12, bHipZ: 0.6, aHipZ: -0.2, bShZ: 1.1, aShZ: -0.5 },
	punch: { twist: -0.5, lean: 0.15, y: -0.1, bShX: -1.55, aShX: 0.5, aHip: -0.4, bHip: 0.38 },
	// leaning back flat under a fireball
	matrix: { y: -0.92, lean: -1.0, aHip: -1.0, bHip: -0.95, aShX: 1.0, bShX: 1.1, aShZ: -0.8, bShZ: 0.8, headX: 0.3 },
	// flying through the portal, fist first
	dive: { lean: 0.8, bShX: -2.95, aShX: 0.55, aHip: 0.55, bHip: 0.25, headX: -0.55 },
	// landing in a lunge, one arm forward, one back
	landing: { y: -0.36, lean: 0.4, aHip: -0.75, bHip: 0.6, bShX: -0.9, aShX: 0.9, aShZ: -0.4, headX: 0.35 },
	aim: { y: -0.1, lean: 0.05, aHip: -0.3, bHip: 0.25, aHipZ: -0.1, bHipZ: 0.1, bShX: -1.45, bShZ: -0.6, aShX: -1.4, aShZ: 0.75, headX: 0.06 },
	// classic R6 sit: legs straight out
	sit: { y: -0.85, aHip: -1.57, bHip: -1.57, lean: -0.05 },
	sitArms: { aShX: -0.45, bShX: -0.45, aShZ: -0.1, bShZ: 0.1 },
	// leaning back in the chair
	boss: { lean: -0.2, aHipZ: -0.2, bHipZ: 0.2, headX: 0.12 },
	reachA: { aShX: -1.25, aShZ: -0.45, lean: 0.25, twist: -0.3, headY: -0.45, headX: 0.2 },
};

function faceTexture() {
	const c = document.createElement('canvas');
	c.width = 128;
	c.height = 128;
	const g = c.getContext('2d');
	// tired eyes: dark ovals with heavy lids
	for (const x of [42, 86]) {
		g.fillStyle = '#0c0c0c';
		g.beginPath();
		g.ellipse(x, 62, 13, 10, 0, 0, Math.PI * 2);
		g.fill();
		g.fillStyle = '#ffffff';
		g.beginPath();
		g.ellipse(x - 4, 64, 3, 3, 0, 0, Math.PI * 2);
		g.fill();
		g.fillStyle = '#5d4433';
		g.fillRect(x - 15, 46, 30, 13);
		g.fillStyle = '#0c0c0c';
		g.fillRect(x - 15, 57, 30, 3);
	}
	g.strokeStyle = '#2a1c14';
	g.lineWidth = 3;
	g.beginPath();
	g.moveTo(54, 96);
	g.lineTo(74, 96);
	g.stroke();
	const t = new THREE.CanvasTexture(c);
	t.colorSpace = THREE.SRGBColorSpace;
	return t;
}

export function buildCharacter(avatar) {
	const edgeMat = new THREE.LineBasicMaterial({ color: 0x00ff66, transparent: true, opacity: avatar ? 0.22 : 0.32 });
	const mats = {
		skin: new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.75 }),
		jacket: new THREE.MeshStandardMaterial({ color: JACKET, roughness: 0.38, metalness: 0.25 }),
		pants: new THREE.MeshStandardMaterial({ color: PANTS, roughness: 0.6, metalness: 0.1 }),
		shoe: new THREE.MeshStandardMaterial({ color: SHOE, roughness: 0.5 }),
		gold: new THREE.MeshStandardMaterial({ color: GOLD, roughness: 0.3, metalness: 0.8, emissive: 0x3a2a08 }),
		hair: new THREE.MeshStandardMaterial({ color: HAIR, roughness: 0.9 }),
		cap: new THREE.MeshStandardMaterial({ color: CAP, roughness: 0.42, metalness: 0.2 }),
		white: new THREE.MeshStandardMaterial({ color: 0xdedede, roughness: 0.8 }),
	};

	function box(w, h, d, mat, edges = true) {
		const geo = new THREE.BoxGeometry(w, h, d);
		const mesh = new THREE.Mesh(geo, mat);
		if (edges) mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat));
		return mesh;
	}
	function at(obj, x, y, z, parent) {
		obj.position.set(x, y, z);
		parent.add(obj);
		return obj;
	}

	const real = avatar ? avatar.slots : null;
	// drops the exported avatar meshes for one joint into its group
	function wear(slot, parent, outline = true) {
		for (const mesh of real[slot] || []) {
			parent.add(mesh);
			if (outline) mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 50), edgeMat));
		}
	}

	const root = new THREE.Group();
	const body = at(new THREE.Group(), 0, 2, 0, root);
	const spine = at(new THREE.Group(), 0, 0, 0, body);
	const waist = at(new THREE.Group(), 0, 0.5, 0, spine);
	const neck = at(new THREE.Group(), 0, 1.5, 0, waist);

	if (real) {
		wear('spine', spine);
		wear('waist', waist);
		wear('neck', neck, false);
	} else {
		at(box(1.98, 0.5, 0.98, mats.pants), 0, 0.25, 0, spine);
		at(box(2.02, 0.14, 1.02, mats.shoe, false), 0, 0.46, 0, spine);
		at(box(0.5, 0.13, 0.04, mats.gold, false), 0, 0.46, 0.52, spine);
		at(box(2, 1.5, 1, mats.jacket), 0, 0.75, 0, waist);
		at(box(0.05, 1.15, 0.03, mats.gold, false), 0, 0.6, 0.51, waist);
		at(box(0.42, 0.3, 0.03, mats.white, false), 0, 1.33, 0.505, waist);
		at(box(0.12, 0.34, 0.03, mats.shoe, false), 0, 1.3, 0.52, waist);
		const collarA = at(box(0.5, 0.2, 0.06, mats.jacket, false), -0.36, 1.38, 0.5, waist);
		collarA.rotation.z = 0.5;
		const collarB = at(box(0.5, 0.2, 0.06, mats.jacket, false), 0.36, 1.38, 0.5, waist);
		collarB.rotation.z = -0.5;
		at(box(1.16, 1.16, 1.16, mats.skin), 0, 0.6, 0, neck);
		const face = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshBasicMaterial({ map: faceTexture(), transparent: true }));
		at(face, 0, 0.56, 0.585, neck);
		const hair = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.64, 0.22, 20), mats.hair);
		at(hair, 0, 1.02, 0, neck);
		const cap = new THREE.Mesh(new THREE.SphereGeometry(0.84, 24, 14), mats.cap);
		cap.scale.set(1, 0.46, 1.08);
		at(cap, 0, 1.2, -0.02, neck);
		cap.rotation.x = -0.08;
		const brim = at(box(1.0, 0.07, 0.42, mats.cap, false), 0, 1.03, 0.72, neck);
		brim.rotation.x = 0.18;
		at(box(0.12, 0.12, 0.12, mats.cap, false), 0, 1.6, -0.02, neck);
	}

	// shoulder sits half a stud below the top of the arm block, like R6
	function arm(x, side) {
		const sh = at(new THREE.Group(), x, 1.0, 0, waist);
		if (real) {
			wear('sh' + side, sh);
		} else {
			at(box(0.98, 1.75, 0.98, mats.jacket), 0, -0.375, 0, sh);
			at(box(0.94, 0.25, 0.94, mats.skin), 0, -1.375, 0, sh);
		}
		return { sh };
	}
	function leg(x, side) {
		const hip = at(new THREE.Group(), x, 0, 0, body);
		if (real) {
			wear('hip' + side, hip);
		} else {
			at(box(0.97, 1.75, 0.97, mats.pants), 0, -0.875, 0, hip);
			at(box(0.97, 0.25, 1.02, mats.shoe), 0, -1.875, 0.02, hip);
		}
		return { hip };
	}
	const a = arm(-1.5, 'A');
	const b = arm(1.5, 'B');
	const la = leg(-0.5, 'A');
	const lb = leg(0.5, 'B');

	function setPose(p) {
		body.position.y = 2 + p.y;
		body.rotation.set(0, p.twist, p.roll);
		spine.rotation.x = p.lean;
		neck.rotation.set(p.headX, p.headY, 0);
		a.sh.rotation.set(p.aShX, p.aShY, p.aShZ);
		b.sh.rotation.set(p.bShX, p.bShY, p.bShZ);
		la.hip.rotation.set(p.aHip, 0, p.aHipZ);
		lb.hip.rotation.set(p.bHip, 0, p.bHipZ);
	}

	// assault rifle he summons for the exploiter fight, held in front of the chest
	const rifle = new THREE.Group();
	const gunMat = new THREE.MeshStandardMaterial({ color: 0x0c0e0d, roughness: 0.4, metalness: 0.7 });
	const gunEdge = new THREE.LineBasicMaterial({ color: 0x00ff66, transparent: true, opacity: 0.85 });
	function gunPart(w, h, d, x, y, z, rx = 0) {
		const geo = new THREE.BoxGeometry(w, h, d);
		const mesh = new THREE.Mesh(geo, gunMat);
		mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), gunEdge));
		mesh.position.set(x, y, z);
		mesh.rotation.x = rx;
		rifle.add(mesh);
		return mesh;
	}
	gunPart(0.24, 0.34, 1.5, 0, 0, 1.25);
	gunPart(0.2, 0.3, 0.75, 0, -0.06, 0.2, 0.12);
	gunPart(0.26, 0.42, 0.14, 0, -0.1, -0.2);
	gunPart(0.1, 0.1, 1.0, 0, 0.04, 2.5);
	gunPart(0.2, 0.2, 0.7, 0, 0.02, 2.2);
	gunPart(0.16, 0.14, 0.34, 0, 0.04, 3.05);
	gunPart(0.17, 0.62, 0.3, 0, -0.44, 1.35, -0.28);
	gunPart(0.15, 0.4, 0.2, 0, -0.34, 0.72, 0.3);
	gunPart(0.08, 0.1, 0.9, 0, 0.23, 1.25);
	gunPart(0.1, 0.16, 0.1, 0, 0.3, 0.85);
	gunPart(0.1, 0.16, 0.1, 0, 0.3, 1.9);
	const muzzle = new THREE.Object3D();
	muzzle.position.set(0, 0.04, 3.25);
	rifle.add(muzzle);
	const flash = new THREE.Group();
	const flashMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
	for (let i = 0; i < 3; i++) {
		const blade = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 1.5), flashMat);
		blade.rotation.set(Math.PI / 2, (i * Math.PI) / 3, 0);
		blade.position.z = 0.6;
		flash.add(blade);
	}
	const flashLight = new THREE.PointLight(0xffe08a, 0, 22);
	flash.add(flashLight);
	muzzle.add(flash);
	const summonLight = new THREE.PointLight(0x00ff66, 0, 14);
	summonLight.position.z = 1.3;
	rifle.add(summonLight);
	rifle.position.set(0.3, 1.02, 0.35);
	rifle.visible = false;
	waist.add(rifle);
	const gun = { group: rifle, muzzle, flash, flashLight, summonLight, home: rifle.position.clone() };

	return { root, setPose, edgeMat, gun };
}

// loads the avatar exported from Studio. returns null if it isn't there, then the box version is used
export async function loadAvatar(base) {
	try {
		const get = async (file) => {
			const res = await fetch(base + file);
			if (!res.ok) throw new Error(file);
			return res;
		};
		const manifest = await (await get('avatar.json')).json();
		const buffer = await (await get('avatar.bin')).arrayBuffer();
		const loader = new THREE.TextureLoader();
		const mats = {};
		await Promise.all([...new Set(manifest.meshes.map((m) => m.tex))].map(async (name) => {
			const map = await loader.loadAsync(`${base}${name}.png`);
			map.colorSpace = THREE.SRGBColorSpace;
			map.anisotropy = 4;
			const isBody = name === 'body';
			mats[name] = new THREE.MeshStandardMaterial({ map, roughness: isBody ? 0.82 : 0.8, metalness: 0, alphaTest: isBody ? 0 : 0.35, side: isBody ? THREE.FrontSide : THREE.DoubleSide });
		}));
		const slots = {};
		for (const m of manifest.meshes) {
			const data = new Float32Array(buffer, m.offset, m.count * 8);
			const pos = new Float32Array(m.count * 3);
			const uv = new Float32Array(m.count * 2);
			const nrm = new Float32Array(m.count * 3);
			for (let i = 0; i < m.count; i++) {
				pos.set(data.subarray(i * 8, i * 8 + 3), i * 3);
				uv.set(data.subarray(i * 8 + 3, i * 8 + 5), i * 2);
				nrm.set(data.subarray(i * 8 + 5, i * 8 + 8), i * 3);
			}
			const geo = new THREE.BufferGeometry();
			geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
			geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
			geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
			(slots[m.slot] ||= []).push(new THREE.Mesh(geo, mats[m.tex]));
		}
		return { pivots: manifest.pivots, slots };
	} catch (err) {
		console.warn('avatar not loaded, using the box version', err);
		return null;
	}
}

// simple wireframe fighter used for bots and exploiters
export function buildWireGuy(color) {
	const line = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 });
	const fill = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.75 });
	function box(w, h, d) {
		const geo = new THREE.BoxGeometry(w, h, d);
		const mesh = new THREE.Mesh(geo, fill);
		mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), line));
		return mesh;
	}
	const root = new THREE.Group();
	const body = new THREE.Group();
	body.position.y = 2;
	root.add(body);
	const torso = box(2, 2, 1);
	torso.position.y = 1;
	body.add(torso);
	const head = box(1.15, 1.15, 1.15);
	head.position.y = 2.6;
	body.add(head);
	const parts = {};
	for (const [name, x, y] of [['armA', -1.5, 1.75], ['armB', 1.5, 1.75], ['legA', -0.5, 0], ['legB', 0.5, 0]]) {
		const pivot = new THREE.Group();
		pivot.position.set(x, y, 0);
		const limb = box(0.96, 2, 0.96);
		limb.position.y = -1;
		pivot.add(limb);
		body.add(pivot);
		parts[name] = pivot;
	}
	return { root, body, parts, line, fill };
}
