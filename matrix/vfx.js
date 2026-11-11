import * as THREE from 'three';

// bending effects rebuilt from ELEMENTUM's BendingVFX: same colours, sizes and particle numbers
const rgb = (r, g, b) => new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
const FIRE = rgb(255, 103, 27);
const FIRE_CORE = rgb(255, 246, 214);
const FIRE_HOT = rgb(255, 196, 64);
const FIRE_DEEP = rgb(190, 38, 16);
const SMOKE_DARK = rgb(46, 36, 32);
const ROCK = rgb(124, 100, 76);
const ROCK_DARK = rgb(80, 64, 50);
const DUST = rgb(178, 153, 114);
const EARTH_RADIUS = { basic: 1.75, heavy: 2.15 };

const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);

class Particles {
	constructor(parent, max, additive) {
		this.max = max;
		this.next = 0;
		this.pos = new Float32Array(max * 3);
		this.tint = new Float32Array(max * 4);
		this.size = new Float32Array(max);
		this.data = Array.from({ length: max }, () => ({ life: 0, age: 1, vx: 0, vy: 0, vz: 0, ax: 0, ay: 0, az: 0, drag: 0, size: 0, alpha: 0, c0: FIRE, c1: FIRE }));
		const geo = new THREE.BufferGeometry();
		geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
		geo.setAttribute('tint', new THREE.BufferAttribute(this.tint, 4));
		geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
		this.uniforms = { scale: { value: 500 } };
		this.points = new THREE.Points(geo, new THREE.ShaderMaterial({
			uniforms: this.uniforms,
			transparent: true,
			depthWrite: false,
			blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
			vertexShader: `
				attribute vec4 tint; attribute float size; uniform float scale; varying vec4 vTint;
				void main() {
					vTint = tint;
					vec4 mv = modelViewMatrix * vec4(position, 1.0);
					gl_PointSize = size * scale / max(0.1, -mv.z);
					gl_Position = projectionMatrix * mv;
				}`,
			fragmentShader: `
				varying vec4 vTint;
				void main() {
					float d = length(gl_PointCoord - 0.5);
					float a = smoothstep(0.5, 0.12, d);
					gl_FragColor = vec4(vTint.rgb, vTint.a * a);
					#include <tonemapping_fragment>
					#include <colorspace_fragment>
				}`,
		}));
		this.points.frustumCulled = false;
		parent.add(this.points);
	}
	// dir = main direction, spread in radians (Math.PI = every direction)
	emit(count, p, o) {
		for (let n = 0; n < count; n++) {
			const i = this.next;
			this.next = (this.next + 1) % this.max;
			const d = this.data[i];
			const speed = o.speed * rand(0.45, 1);
			let dx = o.dir ? o.dir[0] : 0;
			let dy = o.dir ? o.dir[1] : 1;
			let dz = o.dir ? o.dir[2] : 0;
			const s = o.spread ?? 0.63;
			dx += (Math.random() - 0.5) * 2 * s;
			dy += (Math.random() - 0.5) * 2 * s;
			dz += (Math.random() - 0.5) * 2 * s;
			const len = Math.hypot(dx, dy, dz) || 1;
			d.vx = (dx / len) * speed;
			d.vy = (dy / len) * speed;
			d.vz = (dz / len) * speed;
			d.ax = 0;
			d.ay = o.gravity || 0;
			d.az = 0;
			d.drag = o.drag || 0;
			d.life = o.life * rand(0.65, 1);
			d.age = 0;
			d.size = o.size;
			d.alpha = o.alpha ?? 0.88;
			d.c0 = o.c0;
			d.c1 = o.c1 || o.c0;
			const j = o.jitter || 0;
			this.pos[i * 3] = p[0] + (Math.random() - 0.5) * j;
			this.pos[i * 3 + 1] = p[1] + (Math.random() - 0.5) * j;
			this.pos[i * 3 + 2] = p[2] + (Math.random() - 0.5) * j;
		}
	}
	update(dt, scale) {
		this.uniforms.scale.value = scale;
		for (let i = 0; i < this.max; i++) {
			const d = this.data[i];
			if (d.age >= d.life) {
				this.size[i] = 0;
				continue;
			}
			d.age += dt;
			const k = Math.min(1, d.age / d.life);
			const damp = Math.max(0, 1 - d.drag * dt);
			d.vx = (d.vx + d.ax * dt) * damp;
			d.vy = (d.vy + d.ay * dt) * damp;
			d.vz = (d.vz + d.az * dt) * damp;
			this.pos[i * 3] += d.vx * dt;
			this.pos[i * 3 + 1] += d.vy * dt;
			this.pos[i * 3 + 2] += d.vz * dt;
			this.size[i] = k < 0.3 ? d.size * lerp(0.4, 1, k / 0.3) : d.size * (1 - (k - 0.3) / 0.7);
			const fade = k < 0.7 ? lerp(1, 0.68, k / 0.7) : 0.68 * (1 - (k - 0.7) / 0.3);
			this.tint[i * 4] = lerp(d.c0.r, d.c1.r, k);
			this.tint[i * 4 + 1] = lerp(d.c0.g, d.c1.g, k);
			this.tint[i * 4 + 2] = lerp(d.c0.b, d.c1.b, k);
			this.tint[i * 4 + 3] = d.alpha * fade;
		}
		const g = this.points.geometry;
		g.attributes.position.needsUpdate = true;
		g.attributes.tint.needsUpdate = true;
		g.attributes.size.needsUpdate = true;
	}
}

export function createVFX(parent, lite) {
	const glow = new Particles(parent, lite ? 500 : 1100, true);
	const haze = new Particles(parent, lite ? 300 : 600, false);
	const density = lite ? 0.55 : 1;
	const ballGeo = new THREE.SphereGeometry(0.5, 14, 10);

	const flames = (n, p, dir, speed, life, size, spread, jitter) => glow.emit(n, p, { dir, speed, life, size, spread, jitter, c0: FIRE_HOT, c1: FIRE_DEEP, alpha: 0.5 });
	const embers = (n, p, dir, speed, size, spread, jitter) => glow.emit(n, p, { dir, speed, life: 0.55, size: size * 2.2, spread, jitter, c0: FIRE_HOT, c1: FIRE_DEEP, gravity: 9, drag: 2, alpha: 1 });
	const darkSmoke = (n, p, dir, speed, size, spread, jitter) => haze.emit(n, p, { dir, speed, life: 0.6, size, spread, jitter, c0: SMOKE_DARK, gravity: 4, alpha: 0.5 });
	const grit = (n, p, dir, speed, spread, jitter) => haze.emit(n, p, { dir, speed, life: 0.5, size: 0.34, spread, jitter, c0: ROCK_DARK, gravity: -50, alpha: 1 });
	const dust = (n, p, dir, speed, size, spread, jitter) => haze.emit(n, p, { dir, speed, life: 0.6, size, spread, jitter, c0: DUST, gravity: -3, drag: 2, alpha: 0.6 });

	// flame tongue: a stretched glowing ball that flickers
	function tongue(group, list, size, color, offset, alpha = 0) {
		const mesh = new THREE.Mesh(ballGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 - alpha, blending: THREE.AdditiveBlending, depthWrite: false }));
		mesh.position.set(offset[0], offset[1], offset[2]);
		mesh.scale.set(size[0], size[1], size[2]);
		group.add(mesh);
		list.push({ mesh, size, seed: Math.random() * 100, scale: 1 });
		return mesh;
	}
	function flicker(list, age) {
		for (const item of list) {
			const n = Math.sin(age * 23 + item.seed) * Math.sin(age * 7.3 + item.seed * 2) * 0.5;
			item.mesh.scale.set(item.size[0] * (1 + n * 0.25) * item.scale, item.size[1] * (1 + n * 0.25) * item.scale, item.size[2] * (1 + n * 0.5) * item.scale);
		}
	}
	const streakTex = (() => {
		const c = document.createElement('canvas');
		c.width = 16;
		c.height = 128;
		const g = c.getContext('2d');
		const grad = g.createLinearGradient(0, 0, 0, 128);
		grad.addColorStop(0, 'rgba(255,196,64,0.5)');
		grad.addColorStop(0.4, 'rgba(255,103,27,0.32)');
		grad.addColorStop(1, 'rgba(190,38,16,0)');
		g.fillStyle = grad;
		g.fillRect(0, 0, 16, 128);
		const t = new THREE.CanvasTexture(c);
		t.colorSpace = THREE.SRGBColorSpace;
		return t;
	})();
	function streak(group, x, width, length) {
		const mat = new THREE.MeshBasicMaterial({ map: streakTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
		for (const roll of [0, Math.PI / 2]) {
			const geo = new THREE.PlaneGeometry(width, length);
			geo.rotateX(-Math.PI / 2);
			geo.translate(0, 0, length / 2 + 0.4);
			const plane = new THREE.Mesh(geo, mat);
			plane.position.x = x;
			plane.rotation.z = roll;
			group.add(plane);
		}
	}

	// group faces its travel direction with +z. inside it the game layout is used: +z is behind the bolt
	function fireBolt(heavy) {
		const group = new THREE.Group();
		const inner = new THREE.Group();
		inner.rotation.y = Math.PI;
		group.add(inner);
		const list = [];
		if (heavy) {
			for (let i = 1; i <= 7; i++) {
				const a = -0.95 + (i - 1) * 0.317;
				const x = Math.sin(a) * 1.9;
				const z = (1 - Math.cos(a)) * 1.3;
				tongue(inner, list, [0.75, 1.3, 2.8], i % 2 === 0 ? FIRE_HOT : FIRE, [x, 0, z + 0.9], 0.25);
				tongue(inner, list, [0.5, 0.8, 2.0], FIRE_DEEP, [x * 1.05, 0.3, z + 2.2], 0.45);
				if (i % 2 === 1) tongue(inner, list, [0.35, 0.6, 1.2], FIRE_CORE, [x * 0.98, 0, z + 0.3]);
			}
			streak(inner, -1.8, 0.4, 3.2);
			streak(inner, 1.8, 0.4, 3.2);
			streak(inner, 0, 0.5, 3.6);
		} else {
			tongue(inner, list, [0.34, 0.34, 1.2], FIRE_CORE, [0, 0, 0.3], 0.1);
			tongue(inner, list, [0.6, 0.6, 1.8], FIRE_HOT, [0, 0, 0.8], 0.45);
			streak(inner, 0, 0.3, 2.6);
		}
		const light = new THREE.PointLight(0xff6718, heavy ? 110 : 55, 22);
		group.add(light);
		group.visible = false;
		parent.add(group);
		const back = new THREE.Vector3();
		const shot = {
			group, kind: 'fire', heavy, prev: -1, age: Math.random() * 10, carry: 0,
			update(dt, on) {
				if (!on) return;
				shot.age += dt;
				inner.rotation.z = Math.sin(shot.age * 31) * 0.06;
				flicker(list, shot.age);
				light.intensity = (heavy ? 110 : 55) * (0.85 + Math.sin(shot.age * 40) * 0.15);
				// particles trail out of the back of the bolt
				back.set(0, 0, -1).applyQuaternion(group.quaternion);
				const dir = [back.x, back.y, back.z];
				const p = group.position;
				const at = [p.x + back.x * 0.6, p.y + back.y * 0.6, p.z + back.z * 0.6];
				shot.carry += dt * density;
				const steps = Math.floor(shot.carry * 60);
				shot.carry -= steps / 60;
				const width = heavy ? 3.4 : 0.3;
				for (let i = 0; i < steps; i++) {
					if (heavy) {
						flames(1, at, dir, 6, 0.25, 2.4, 0.63, width);
						embers(1, at, dir, 6, 0.18, 0.63, width);
						if (Math.random() < 0.3) darkSmoke(1, at, dir, 3, 1.8, 0.63, width);
					} else {
						if (Math.random() < 0.5) flames(1, at, dir, 4, 0.18, 1.2, 0.63, width);
						if (Math.random() < 0.6) embers(1, at, dir, 4, 0.14, 0.63, width);
						if (Math.random() < 0.23) darkSmoke(1, at, dir, 2, 0.9, 0.63, width);
					}
				}
			},
		};
		return shot;
	}

	// coin-shaped stone disk, lying flat and spinning
	function earthDisk(heavy) {
		const radius = EARTH_RADIUS[heavy ? 'heavy' : 'basic'];
		const group = new THREE.Group();
		const spin = new THREE.Group();
		group.add(spin);
		const rim = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.42, 14), new THREE.MeshStandardMaterial({ color: ROCK_DARK, roughness: 1, flatShading: true }));
		const face = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.9, radius * 0.9, 0.46, 14), new THREE.MeshStandardMaterial({ color: ROCK, roughness: 0.95, flatShading: true }));
		spin.add(rim, face);
		const hole = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.22, radius * 0.22, 0.5, 4), new THREE.MeshStandardMaterial({ color: 0x1a1410, roughness: 1 }));
		spin.add(hole);
		// chipped edge so the spin is visible
		for (let i = 0; i < 5; i++) {
			const a = (i / 5) * Math.PI * 2 + 0.4;
			const chip = new THREE.Mesh(new THREE.BoxGeometry(radius * 0.3, 0.5, radius * 0.16), new THREE.MeshStandardMaterial({ color: i % 2 ? ROCK : ROCK_DARK, roughness: 1, flatShading: true }));
			chip.position.set(Math.cos(a) * radius * 0.95, 0, Math.sin(a) * radius * 0.95);
			chip.rotation.y = -a + 0.5;
			spin.add(chip);
		}
		group.visible = false;
		parent.add(group);
		const shot = {
			group, kind: 'earth', heavy, prev: -1, age: Math.random() * 10, carry: 0,
			update(dt, on) {
				if (!on) return;
				shot.age += dt;
				spin.rotation.y = shot.age * 7;
				const p = group.position;
				const at = [p.x, p.y, p.z];
				shot.carry += dt * density;
				const steps = Math.floor(shot.carry * 60);
				shot.carry -= steps / 60;
				for (let i = 0; i < steps; i++) {
					if (Math.random() < (heavy ? 0.57 : 0.33)) grit(1, at, [0, -0.2, -1], 3, 0.85, radius * 1.6);
					if (Math.random() < (heavy ? 0.37 : 0.23)) dust(1, at, [0, 0, -1], 2, heavy ? 1.8 : 1.1, 0.63, radius * 1.4);
				}
			},
		};
		return shot;
	}

	// hit effects: reused rigs, timed from the moment they are fired
	const bursts = [];
	for (let n = 0; n < 3; n++) {
		const group = new THREE.Group();
		const flash = new THREE.Mesh(ballGeo, new THREE.MeshBasicMaterial({ color: FIRE_CORE, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
		group.add(flash);
		const streaks = [];
		for (let i = 1; i <= 12; i++) {
			const mesh = new THREE.Mesh(ballGeo, new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? FIRE_HOT : FIRE, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
			group.add(mesh);
			streaks.push(mesh);
		}
		const light = new THREE.PointLight(0xff8a30, 0, 30);
		group.add(light);
		group.visible = false;
		parent.add(group);
		bursts.push({ group, flash, streaks, light, age: 9, heavy: false });
	}
	let nextBurst = 0;
	const tmp = new THREE.Vector3();
	const FORWARD = new THREE.Vector3(0, 0, 1);

	function fireImpact(p, heavy) {
		const b = bursts[nextBurst];
		nextBurst = (nextBurst + 1) % bursts.length;
		b.age = 0;
		b.heavy = heavy;
		b.group.position.set(p[0], p[1], p[2]);
		b.group.visible = true;
		const all = Math.PI;
		flames(Math.round((heavy ? 22 : 14) * density), p, null, 13, 0.3, heavy ? 2.2 : 1.6, all, 0.4);
		embers(Math.round((heavy ? 26 : 16) * density), p, null, 14, 0.16, all, 0.3);
		darkSmoke(Math.round((heavy ? 10 : 6) * density), p, null, 5, heavy ? 2.2 : 1.6, all, 0.5);
	}
	function earthImpact(p, heavy) {
		const all = Math.PI;
		dust(Math.round((heavy ? 32 : 24) * density), p, null, heavy ? 14 : 10, heavy ? 2.8 : 2, all, 0.6);
		haze.emit(Math.round((heavy ? 30 : 18) * density), p, { speed: 16, life: 0.5, size: 0.34, spread: all, jitter: 0.4, c0: ROCK_DARK, gravity: -50, alpha: 1 });
	}

	// ring of flames on the floor while a heavy fire move charges
	const ring = new THREE.Group();
	const ringList = [];
	const scorch = new THREE.Mesh(new THREE.CircleGeometry(2.8, 28), new THREE.MeshBasicMaterial({ color: rgb(30, 20, 16), transparent: true, opacity: 0.65, depthWrite: false }));
	scorch.rotation.x = -Math.PI / 2;
	scorch.position.y = 0.04;
	ring.add(scorch);
	for (let k = 1; k <= 10; k++) {
		const a = (k / 10) * Math.PI * 2;
		tongue(ring, ringList, [0.45, 1.3, 0.45], k % 2 === 0 ? FIRE_HOT : FIRE, [Math.cos(a) * 2.5, 0.65, Math.sin(a) * 2.5], 0.2);
	}
	ring.visible = false;
	parent.add(ring);
	let ringAge = 0;

	return {
		fireBolt, earthDisk, fireImpact, earthImpact,
		// charge glow at a hand before a throw
		windup(kind, p, dt) {
			if (Math.random() > dt * 60 * density) return;
			if (kind === 'fire') {
				flames(1, p, [0, 1, 0], 2, 0.2, 0.9, 0.8, 0.3);
				if (Math.random() < 0.5) embers(1, p, [0, 1, 0], 3, 0.14, 1, 0.3);
			} else {
				if (Math.random() < 0.5) dust(1, p, [0, 1, 0], 2, 0.9, 1, 0.5);
				if (Math.random() < 0.6) grit(1, p, [0, 1, 0], 3, 1, 0.5);
			}
		},
		castRing(p, grow, dt) {
			ring.visible = grow > 0.01;
			if (!ring.visible) return;
			ringAge += dt;
			ring.position.set(p[0], p[1], p[2]);
			scorch.material.opacity = 0.65 * grow;
			for (const item of ringList) item.scale = grow;
			flicker(ringList, ringAge);
			if (Math.random() < dt * 40 * density) {
				const a = Math.random() * Math.PI * 2;
				embers(1, [p[0] + Math.cos(a) * 2.5, p[1] + 0.3, p[2] + Math.sin(a) * 2.5], [0, 1, 0], 4, 0.14, 0.5, 0.2);
			}
		},
		update(dt, scale) {
			glow.update(dt, scale);
			haze.update(dt, scale);
			for (const b of bursts) {
				if (!b.group.visible) continue;
				b.age += dt;
				const k = b.age / 0.32;
				if (k >= 1) {
					b.group.visible = false;
					continue;
				}
				b.flash.scale.setScalar(1.1 * (1 + k * 3));
				b.flash.material.opacity = 0.65 * (1 - k);
				b.light.intensity = (b.heavy ? 260 : 150) * (1 - k);
				const count = b.heavy ? 12 : 8;
				b.streaks.forEach((mesh, i) => {
					mesh.visible = i < count;
					if (!mesh.visible) return;
					const a = ((i + 1) * Math.PI * 2) / count;
					tmp.set(Math.cos(a), 0.35 + ((i + 1) % 3) * 0.25, Math.sin(a)).normalize();
					const reach = (b.heavy ? 16 : 12) * b.age;
					mesh.position.copy(tmp).multiplyScalar(reach);
					mesh.quaternion.setFromUnitVectors(FORWARD, tmp);
					const s = (b.heavy ? 1.3 : 1) * (1 - k);
					mesh.scale.set(0.4 * s, 0.4 * s, 1.6 * s);
					mesh.material.opacity = 0.85 * (1 - k);
				});
			}
		},
	};
}
