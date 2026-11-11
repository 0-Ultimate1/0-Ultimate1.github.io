import * as THREE from 'three';
import { buildWireGuy } from './character.js';
import { createVFX } from './vfx.js';

export const AX = 600;
export const LX = 1200;
export const OX = 1800;
export const PORTAL_Z = -180;

const GREEN = 0x00ff66;
const DIM = 0x0a6b33;
const RED = 0xff2238;
const FIRE = 0xff7a1a;
const MONO = '"JetBrains Mono", ui-monospace, Menlo, monospace';

function canvasTex(w, h, draw) {
	const c = document.createElement('canvas');
	c.width = w;
	c.height = h;
	draw(c.getContext('2d'), w, h);
	const t = new THREE.CanvasTexture(c);
	t.colorSpace = THREE.SRGBColorSpace;
	t.anisotropy = 4;
	return t;
}

function edges(geo, color, opacity = 1) {
	return new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity }));
}

function wireBox(w, h, d, color, fill = 0x030806, opacity = 1) {
	const geo = new THREE.BoxGeometry(w, h, d);
	const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: fill, roughness: 0.7 }));
	mesh.add(edges(geo, color, opacity));
	return mesh;
}

function put(obj, parent, x, y, z) {
	obj.position.set(x, y, z);
	parent.add(obj);
	return obj;
}

// ---------- code rain: real lines from the game's scripts, falling and looping ----------
const FALLBACK_CODE = [{ lines: ['local Players = game:GetService("Players")', 'local Guard = require(script.RemoteGuard)', 'Remote.OnServerEvent:Connect(function(player)', '  if not Guard.allow(player, "Move", 8, 4) then', '    return', '  end', '  Combat.fire(player)', 'end)'] }];
const codeTextures = [];
function codeTexture(lines) {
	const tex = canvasTex(512, lines.length * 32, (g) => {
		g.font = `19px ${MONO}`;
		g.textBaseline = 'middle';
		lines.forEach((line, i) => {
			// a few lines glow brighter, like the head of a rain column
			g.fillStyle = `rgba(255,255,255,${Math.random() < 0.09 ? 1 : 0.28 + Math.random() * 0.45})`;
			g.fillText(line, 6, i * 32 + 16);
		});
	});
	tex.wrapT = THREE.RepeatWrapping;
	codeTextures.push({ tex, speed: 0.022 + Math.random() * 0.02 });
	return tex;
}

class Rain {
	constructor(color, brightness, chunks, lite) {
		this.brightness = brightness;
		this.rows = lite ? 32 : 64;
		const use = chunks && chunks.length ? chunks : FALLBACK_CODE;
		this.files = use.map((chunk) => chunk.file || 'script.lua');
		this.mats = use.map((chunk) => {
			const lines = [];
			for (let i = 0; i < this.rows; i++) lines.push(chunk.lines[i % chunk.lines.length]);
			return new THREE.MeshBasicMaterial({ map: codeTexture(lines), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
		});
		// sheets[i] = every wall sheet showing chunk i, boost[i] = extra glow while it is being read
		this.sheets = use.map(() => []);
		this.boost = use.map(() => 0);
		this.count = 0;
		this.color = new THREE.Color(color);
		this.level = 1;
		this.apply();
	}
	setColor(c, level = 1) {
		this.color.copy(c);
		this.level = level;
		this.apply();
	}
	apply() {
		this.mats.forEach((m, i) => m.color.copy(this.color).multiplyScalar(this.brightness * this.level * (1 + this.boost[i])));
	}
	// one sheet of code, w wide and h tall. the text keeps its shape whatever the size
	sheet(parent, x, y, z, rotY, h, w) {
		const geo = new THREE.PlaneGeometry(w, h);
		const uv = geo.attributes.uv;
		const shift = Math.random();
		const scale = h / ((w * this.rows) / 16);
		for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * scale + shift);
		const index = this.count++ % this.mats.length;
		const mesh = new THREE.Mesh(geo, this.mats[index]);
		mesh.position.set(x, y, z);
		mesh.rotation.y = rotY;
		mesh.userData.w = w;
		mesh.userData.h = h;
		parent.add(mesh);
		this.sheets[index].push(mesh);
		return mesh;
	}
	// sheets in a circle, all facing the middle
	ring(parent, radius, count, h, w) {
		for (let i = 0; i < count; i++) {
			const a = (i / count) * Math.PI * 2 + Math.random() * 0.1;
			const r = radius + Math.random() * 10;
			this.sheet(parent, Math.sin(a) * r, h / 2 - 2, Math.cos(a) * r, a + Math.PI, h, w);
		}
	}
}

function gridLines(w, d, stepX, stepZ, color, opacity) {
	const pts = [];
	for (let x = -w / 2; x <= w / 2 + 0.01; x += stepX) pts.push(x, 0, -d / 2, x, 0, d / 2);
	for (let z = -d / 2; z <= d / 2 + 0.01; z += stepZ) pts.push(-w / 2, 0, z, w / 2, 0, z);
	const geo = new THREE.BufferGeometry();
	geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
	return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
}

function circleLine(r, color, opacity = 1, seg = 96) {
	const pts = [];
	for (let i = 0; i <= seg; i++) {
		const a = (i / seg) * Math.PI * 2;
		pts.push(new THREE.Vector3(Math.sin(a) * r, 0, Math.cos(a) * r));
	}
	return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity }));
}

function textPlane(w, h, draw, pxPerUnit = 96) {
	const tex = canvasTex(Math.round(w * pxPerUnit), Math.round(h * pxPerUnit), draw);
	return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide }));
}

function panelFrame(g, w, h, title, color = '#00ff66') {
	g.fillStyle = 'rgba(0,14,7,0.9)';
	g.fillRect(0, 0, w, h);
	g.strokeStyle = color;
	g.lineWidth = 4;
	g.strokeRect(4, 4, w - 8, h - 8);
	g.fillStyle = color;
	g.fillRect(4, 4, w - 8, 44);
	g.fillStyle = '#001a0a';
	g.font = `bold 26px ${MONO}`;
	g.textBaseline = 'middle';
	g.fillText(title, 20, 27);
	g.fillText('×', w - 40, 27);
}

function makePortal() {
	const group = new THREE.Group();
	const ring = new THREE.Mesh(new THREE.TorusGeometry(4.3, 0.16, 12, 64), new THREE.MeshBasicMaterial({ color: 0x9dffc4 }));
	group.add(ring);
	const outer = new THREE.Mesh(new THREE.TorusGeometry(4.9, 0.05, 8, 64), new THREE.MeshBasicMaterial({ color: GREEN }));
	group.add(outer);
	const swirlTex = canvasTex(512, 512, (g, w) => {
		g.translate(w / 2, w / 2);
		for (let arm = 0; arm < 5; arm++) {
			g.rotate((Math.PI * 2) / 5);
			g.beginPath();
			for (let i = 0; i < 220; i++) {
				const r = i * 1.15;
				const a = i * 0.045;
				g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
			}
			g.strokeStyle = 'rgba(120,255,180,0.8)';
			g.lineWidth = 7;
			g.stroke();
		}
		const grad = g.createRadialGradient(0, 0, 0, 0, 0, 256);
		grad.addColorStop(0, 'rgba(220,255,235,0.95)');
		grad.addColorStop(0.35, 'rgba(0,255,102,0.25)');
		grad.addColorStop(1, 'rgba(0,255,102,0)');
		g.fillStyle = grad;
		g.fillRect(-256, -256, 512, 512);
	});
	const discs = [];
	for (let i = 0; i < 2; i++) {
		const disc = new THREE.Mesh(new THREE.CircleGeometry(4.25, 48), new THREE.MeshBasicMaterial({
			map: swirlTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, opacity: i ? 0.5 : 0.9,
		}));
		disc.position.z = i * 0.05;
		group.add(disc);
		discs.push(disc);
	}
	const light = new THREE.PointLight(GREEN, 60, 40);
	group.add(light);
	return { group, discs, outer };
}

function workTexture(index, title, path) {
	return canvasTex(960, 540, (g, w, h) => {
		g.fillStyle = 'rgba(0,10,5,0.92)';
		g.fillRect(0, 0, w, h);
		g.strokeStyle = 'rgba(0,255,102,0.25)';
		g.lineWidth = 1;
		for (let y = 0; y < h; y += 6) {
			g.beginPath();
			g.moveTo(0, y);
			g.lineTo(w, y);
			g.stroke();
		}
		g.strokeStyle = '#00ff66';
		g.lineWidth = 6;
		g.strokeRect(3, 3, w - 6, h - 6);
		g.fillStyle = '#00ff66';
		g.font = `bold 34px ${MONO}`;
		g.fillText(`0${index + 1} / 04`, 50, 80);
		g.font = `24px ${MONO}`;
		g.fillStyle = 'rgba(0,255,102,0.7)';
		g.fillText(path, 50, h - 50);
		g.fillStyle = '#eafff2';
		g.font = 'bold 86px "Space Grotesk", Arial, sans-serif';
		const words = title.split(' ');
		let line = '';
		let y = 250;
		for (const word of words) {
			if (g.measureText(line + word).width > w - 110 && line) {
				g.fillText(line, 50, y);
				y += 96;
				line = '';
			}
			line += word + ' ';
		}
		g.fillText(line, 50, y);
	});
}

export function buildWorld(scene, story, lite, code) {
	code = code || {};
	const world = {};
	const rainCount = lite ? 0.45 : 1;

	// ---------- corridor ----------
	const corridor = new THREE.Group();
	scene.add(corridor);
	const corridorFloor = new THREE.Mesh(new THREE.PlaneGeometry(70, 300), new THREE.MeshStandardMaterial({ color: 0x020604, roughness: 0.5, metalness: 0.3 }));
	corridorFloor.rotation.x = -Math.PI / 2;
	put(corridorFloor, corridor, 0, -0.02, -100);
	put(gridLines(70, 300, 2.5, 5, DIM, 0.55), corridor, 0, 0, -100);
	for (let z = -15; z >= -165; z -= 25) {
		put(edges(new THREE.BoxGeometry(26, 13, 0.8), GREEN, 0.45), corridor, 0, 6.5, z);
	}
	const corridorRain = new Rain(GREEN, 0.65, code.corridor, lite);
	for (let z = 24; z > -215; z -= 8 / rainCount) {
		for (const side of [-1, 1]) {
			const x = side * (15 + Math.random() * 10);
			corridorRain.sheet(corridor, x, 14, z + Math.random() * 3, -side * Math.PI / 2 + (Math.random() - 0.5) * 0.5, 30, 7 + Math.random() * 3);
		}
	}
	for (let i = 0; i < 7; i++) {
		corridorRain.sheet(corridor, -30 + i * 10, 14, 30 + Math.random() * 12, Math.PI, 30, 8);
	}
	// past work: floor projectors that beam up a hologram of the footage
	world.holos = [];
	const holoUniforms = [];
	story.works.forEach((work, i) => {
		const frame = new THREE.Group();
		let map;
		let video = null;
		if (work.media && work.media.endsWith('.mp4')) {
			video = document.createElement('video');
			video.src = work.media;
			video.muted = true;
			video.loop = true;
			video.playsInline = true;
			video.preload = 'metadata';
			video.crossOrigin = 'anonymous';
			map = new THREE.VideoTexture(video);
		} else if (work.media) {
			map = new THREE.TextureLoader().load(work.media);
		} else {
			map = workTexture(i, work.title, work.path);
		}
		map.colorSpace = THREE.SRGBColorSpace;
		const uniforms = { map: { value: map }, time: { value: i * 3.1 }, power: { value: 1 } };
		holoUniforms.push(uniforms);
		const screen = new THREE.Mesh(new THREE.PlaneGeometry(10, 5.2), new THREE.ShaderMaterial({
			uniforms,
			transparent: true,
			depthWrite: false,
			side: THREE.DoubleSide,
			vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
			fragmentShader: `
				uniform sampler2D map; uniform float time; uniform float power; varying vec2 vUv;
				void main() {
					vec2 uv = vUv;
					float tear = step(0.992, sin(time * 1.7 + uv.y * 3.0)) * 0.012;
					uv.x += tear * sin(uv.y * 90.0 + time * 30.0);
					vec3 c = texture2D(map, uv).rgb;
					float lum = dot(c, vec3(0.3, 0.6, 0.1));
					vec3 holo = mix(c, lum * vec3(0.3, 1.0, 0.6), 0.45) * 0.5 + vec3(0.0, 0.02, 0.01);
					float scan = 0.66 + 0.34 * sin(vUv.y * 300.0 - time * 7.0);
					float sweep = smoothstep(0.06, 0.0, abs(fract(time * 0.16) - vUv.y)) * 0.08;
					float flick = 0.93 + 0.07 * sin(time * 43.0) * sin(time * 7.3);
					float edge = smoothstep(0.0, 0.035, vUv.x) * smoothstep(1.0, 0.965, vUv.x) * smoothstep(0.0, 0.05, vUv.y) * smoothstep(1.0, 0.95, vUv.y);
					gl_FragColor = vec4((holo * scan + sweep * vec3(0.4, 1.0, 0.7)) * flick, (0.62 + 0.3 * lum) * edge * power);
					#include <tonemapping_fragment>
					#include <colorspace_fragment>
				}`,
		}));
		frame.add(screen);
		const corner = new THREE.LineBasicMaterial({ color: GREEN, transparent: true, opacity: 0.9 });
		for (const sx of [-1, 1]) {
			for (const sy of [-1, 1]) {
				const pts = [new THREE.Vector3(sx * 5.25, sy * 2.0, 0), new THREE.Vector3(sx * 5.25, sy * 2.75, 0), new THREE.Vector3(sx * 4.4, sy * 2.75, 0)];
				frame.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), corner));
			}
		}
		const tag = textPlane(6, 0.62, (g, w, h) => {
			g.fillStyle = '#00ff66';
			g.font = `bold ${h * 0.5}px ${MONO}`;
			g.textBaseline = 'middle';
			g.fillText(`0${i + 1} / 04  ${work.title.toUpperCase()}`, 4, h / 2);
		}, 64);
		put(tag, frame, -2.2, 3.25, 0);
		// projector on the floor with a light cone up to the picture
		const base = new THREE.Group();
		base.add(wireBox(3.4, 0.35, 1.5, GREEN, 0x06100b));
		put(wireBox(2.2, 0.25, 0.9, GREEN, 0x0a1a12, 0.7), base, 0, 0.3, 0);
		const lens = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.06, 0.5), new THREE.MeshBasicMaterial({ color: 0xb6ffd2 }));
		put(lens, base, 0, 0.45, 0);
		put(base, frame, 0, -4.9, 0);
		const beamGeo = new THREE.BufferGeometry();
		const top = -2.6;
		const bottom = -4.45;
		beamGeo.setAttribute('position', new THREE.Float32BufferAttribute([-0.9, bottom, 0, 0.9, bottom, 0, 5, top, 0, -0.9, bottom, 0, 5, top, 0, -5, top, 0], 3));
		beamGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0.4, 0, 0.6, 0, 1, 1, 0.4, 0, 1, 1, 0, 1], 2));
		const beamMat = new THREE.MeshBasicMaterial({ color: GREEN, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
		frame.add(new THREE.Mesh(beamGeo, beamMat));
		const glow = new THREE.PointLight(GREEN, 14, 16);
		put(glow, frame, 0, 0, 1.5);
		frame.rotation.y = Math.PI / 2 - 0.25;
		put(frame, corridor, -9.5, 5.1, -35 - i * 35 + 3);
		world.holos.push({ frame, video, uniforms, beamMat, glow });
	});
	const portalA = makePortal();
	put(portalA.group, corridor, 0, 4.6, PORTAL_Z);
	world.corridor = corridor;

	// ---------- arena ----------
	const arena = new THREE.Group();
	arena.position.x = AX;
	scene.add(arena);
	const hexGeo = new THREE.CylinderGeometry(25, 25, 0.8, 6);
	const hex = new THREE.Mesh(hexGeo, new THREE.MeshStandardMaterial({ color: 0x050d09, roughness: 0.45, metalness: 0.35 }));
	hex.add(edges(hexGeo, GREEN));
	hex.rotation.y = Math.PI / 6;
	put(hex, arena, 0, -0.4, 0);
	for (const [z, color, op] of [[0, 0xeafff2, 1], [5, GREEN, 0.7], [10.5, GREEN, 0.5], [-5, FIRE, 0.7], [-10.5, FIRE, 0.5]]) {
		const half = 21.6 - Math.abs(z) * 0.58;
		const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-half, 0.03, z), new THREE.Vector3(half, 0.03, z)]);
		arena.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: op })));
	}
	put(circleLine(3, 0xeafff2, 0.8), arena, 0, 0.03, 0);
	const pool = new THREE.Mesh(new THREE.CircleGeometry(80, 48), new THREE.MeshStandardMaterial({ color: 0x01070a, roughness: 0.2, metalness: 0.6 }));
	pool.rotation.x = -Math.PI / 2;
	put(pool, arena, 0, -3, 0);
	for (const r of [30, 36, 42]) put(circleLine(r, 0x0b6c8c, 0.5), arena, 0, -2.9, 0);
	const crowdPts = [];
	const crowdCol = [];
	for (let tier = 0; tier < 4; tier++) {
		const r = 46 + tier * 4.5;
		put(circleLine(r, DIM, 0.6), arena, 0, 3 + tier * 3.2, 0);
		const n = lite ? 90 : 220;
		for (let i = 0; i < n; i++) {
			const a = Math.random() * Math.PI * 2;
			crowdPts.push(Math.sin(a) * r, 3.6 + tier * 3.2 + Math.random() * 0.8, Math.cos(a) * r);
			const c = Math.random();
			crowdCol.push(c < 0.6 ? 0 : 0.9, 1, c < 0.6 ? 0.4 : 0.9);
		}
	}
	const crowdGeo = new THREE.BufferGeometry();
	crowdGeo.setAttribute('position', new THREE.Float32BufferAttribute(crowdPts, 3));
	crowdGeo.setAttribute('color', new THREE.Float32BufferAttribute(crowdCol, 3));
	const crowd = new THREE.Points(crowdGeo, new THREE.PointsMaterial({ size: 0.55, vertexColors: true, transparent: true, opacity: 0.9 }));
	arena.add(crowd);
	world.crowd = crowd;
	const arenaRain = new Rain(GREEN, 0.75, code.arena, lite);
	arenaRain.ring(arena, 64, Math.round(34 * rainCount), 52, 11);
	put(new THREE.PointLight(0xcfffe0, 500, 90), arena, 0, 22, 4);
	put(new THREE.PointLight(FIRE, 120, 40), arena, 0, 6, -16);
	const portalB = makePortal();
	put(portalB.group, arena, 0, 4.6, 30);
	world.exitPortal = portalB.group;

	world.bots = [];
	for (const x of [-4.5, 4.5]) {
		// left bot bends fire, right bot bends earth
		const bot = buildWireGuy(x < 0 ? FIRE : 0xd0a870);
		put(bot.root, arena, x, 0, -14);
		world.bots.push(bot);
	}

	// attacks use the game's own effect recipes (see vfx.js). the last one is the player's counter
	const fx = createVFX(arena, lite);
	world.fx = fx;
	world.shots = [fx.fireBolt(false), fx.earthDisk(false), fx.fireBolt(false), fx.earthDisk(true), fx.fireBolt(true), fx.earthDisk(false), fx.fireBolt(true)];

	// menus that pop up around the player
	const menus = [
		['SHOP', (g, w, h) => {
			for (let i = 0; i < 6; i++) {
				const x = 28 + (i % 3) * 152;
				const y = 70 + Math.floor(i / 3) * 150;
				g.strokeStyle = '#00ff66';
				g.lineWidth = 2;
				g.strokeRect(x, y, 136, 134);
				g.fillStyle = ['#ff7a1a', '#e0b878', '#4ec3ff', '#eafff2', '#ff7a1a', '#00ff66'][i];
				g.beginPath();
				g.arc(x + 68, y + 54, 30, 0, Math.PI * 2);
				g.fill();
				g.fillStyle = '#00ff66';
				g.font = `bold 20px ${MONO}`;
				g.fillText(`${(i + 2) * 150} ◈`, x + 34, y + 114);
			}
		}],
		['INVENTORY', (g, w, h) => {
			for (let i = 0; i < 8; i++) {
				const x = 28 + (i % 4) * 114;
				const y = 70 + Math.floor(i / 4) * 114;
				g.strokeStyle = i === 1 ? '#eafff2' : '#0a8f3c';
				g.lineWidth = i === 1 ? 4 : 2;
				g.strokeRect(x, y, 100, 100);
				g.fillStyle = i < 5 ? 'rgba(0,255,102,0.35)' : 'rgba(0,255,102,0.08)';
				g.fillRect(x + 22, y + 22, 56, 56);
			}
			g.fillStyle = '#00ff66';
			g.font = `bold 22px ${MONO}`;
			g.fillText('EQUIPPED: FIRE GLOVES', 28, 330);
		}],
		['PROFILE', (g, w, h) => {
			g.fillStyle = '#eafff2';
			g.font = 'bold 44px "Space Grotesk", Arial, sans-serif';
			g.fillText('ULTIMATE', 28, 120);
			g.fillStyle = '#00ff66';
			g.font = `bold 22px ${MONO}`;
			g.fillText('RANK  GOLD II', 28, 170);
			g.strokeStyle = '#00ff66';
			g.lineWidth = 2;
			g.strokeRect(28, 190, 440, 22);
			g.fillRect(28, 190, 290, 22);
			g.fillText('WINS 128    LOSSES 41', 28, 262);
			g.fillText('TITLE  DEVELOPER', 28, 304);
			g.fillText('LEVEL 37', 28, 346);
		}],
	];
	world.menus = menus.map(([title, draw], i) => {
		const tex = canvasTex(512, 384, (g, w, h) => {
			panelFrame(g, w, h, title);
			draw(g, w, h);
		});
		const mesh = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 4.05), new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
		mesh.add(edges(new THREE.BoxGeometry(5.6, 4.25, 0.05), GREEN, 0.9));
		mesh.visible = false;
		arena.add(mesh);
		return mesh;
	});
	world.playButton = textPlane(4.4, 1.4, (g, w, h) => {
		g.fillStyle = '#00210f';
		g.fillRect(0, 0, w, h);
		g.strokeStyle = '#00ff66';
		g.lineWidth = 8;
		g.strokeRect(4, 4, w - 8, h - 8);
		g.fillStyle = '#00ff66';
		g.font = `bold ${h * 0.5}px ${MONO}`;
		g.textAlign = 'center';
		g.textBaseline = 'middle';
		g.fillText('▶ PLAY', w / 2, h / 2);
	});
	world.playButton.visible = false;
	arena.add(world.playButton);
	world.arena = arena;

	// ---------- lobby ----------
	const lobby = new THREE.Group();
	lobby.position.x = LX;
	scene.add(lobby);
	const lobbyFloor = new THREE.Mesh(new THREE.CircleGeometry(21, 64), new THREE.MeshStandardMaterial({ color: 0x040a07, roughness: 0.4, metalness: 0.4 }));
	lobbyFloor.rotation.x = -Math.PI / 2;
	put(lobbyFloor, lobby, 0, -0.02, 0);
	const lobbyLines = [];
	for (const r of [4, 9, 14, 21]) lobbyLines.push(put(circleLine(r, GREEN, r === 21 ? 1 : 0.4), lobby, 0, 0.02, 0));
	for (let i = 0; i < 10; i++) {
		const a = (i / 10) * Math.PI * 2 + 0.3;
		lobbyLines.push(put(edges(new THREE.BoxGeometry(1.4, 16, 1.4), GREEN, 0.55), lobby, Math.sin(a) * 19.5, 8, Math.cos(a) * 19.5));
	}
	[['1v1', -8, -7], ['2v2', 0, -11], ['3v3', 8, -7]].forEach(([label, x, z]) => {
		const pad = new THREE.Mesh(new THREE.RingGeometry(1.7, 2.1, 40), new THREE.MeshBasicMaterial({ color: GREEN, side: THREE.DoubleSide }));
		pad.rotation.x = -Math.PI / 2;
		put(pad, lobby, x, 0.04, z);
		const sign = textPlane(2.6, 1.2, (g, w, h) => {
			g.strokeStyle = '#00ff66';
			g.lineWidth = 5;
			g.strokeRect(3, 3, w - 6, h - 6);
			g.fillStyle = '#eafff2';
			g.font = `bold ${h * 0.55}px ${MONO}`;
			g.textAlign = 'center';
			g.textBaseline = 'middle';
			g.fillText(label, w / 2, h / 2);
		});
		put(sign, lobby, x, 4.2, z);
	});
	const board = textPlane(8, 4.6, (g, w, h) => {
		panelFrame(g, w, h, 'RANKED LEADERBOARD');
		g.font = `bold 30px ${MONO}`;
		['flame_kid', 'xXEarthXx', 'ULTIMATE', 'rockslide09', 'ember_z'].forEach((name, i) => {
			g.fillStyle = i === 2 ? '#eafff2' : '#00ff66';
			g.fillText(`#${i + 1}  ${name}`, 30, 108 + i * 62);
			g.fillText(`${2480 - i * 135}`, w - 150, 108 + i * 62);
		});
	}, 80);
	put(board, lobby, 0, 6.2, -17);
	const lobbyRain = new Rain(GREEN, 0.5, code.lobby, lite);
	lobbyRain.ring(lobby, 25, Math.round(20 * rainCount), 40, 7);
	// the anti-exploit scripts take over the walls while the hackers are in
	const guardRain = new Rain(RED, 0.65, code.guard, lite);
	guardRain.ring(lobby, 24, Math.round(20 * rainCount), 40, 7);
	guardRain.setColor(new THREE.Color(RED), 0);
	world.guardRain = guardRain;
	world.rains = { corridor: corridorRain, arena: arenaRain, lobby: lobbyRain, guard: guardRain };
	const lobbyLight = put(new THREE.PointLight(0xcfffe0, 260, 70), lobby, 0, 16, 2);
	world.lobbyRain = lobbyRain;
	world.lobbyLines = lobbyLines;
	world.lobbyLight = lobbyLight;
	world.dangerLight = put(new THREE.PointLight(RED, 0, 40), lobby, 0, 7, -5);

	world.exploiters = [];
	for (let i = 0; i < 5; i++) {
		const a = THREE.MathUtils.degToRad(-72 + i * 22);
		const guy = buildWireGuy(RED);
		const home = new THREE.Vector3(Math.sin(a) * 8, 0, -Math.cos(a) * 8);
		guy.fill.color.set(0x4a0010);
		guy.fill.opacity = 0.9;
		put(guy.root, lobby, home.x, 0, home.z);
		guy.root.rotation.y = -a;
		guy.root.visible = false;
		const n = lite ? 70 : 160;
		const pos = new Float32Array(n * 3);
		const seeds = [];
		for (let j = 0; j < n; j++) {
			seeds.push({
				o: new THREE.Vector3((Math.random() - 0.5) * 2.6, 0.3 + Math.random() * 4.6, (Math.random() - 0.5) * 1.2),
				v: new THREE.Vector3((Math.random() - 0.5) * 9 + Math.sin(a) * 7, 2 + Math.random() * 7, (Math.random() - 0.5) * 9 - Math.cos(a) * 7),
			});
		}
		const geo = new THREE.BufferGeometry();
		geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
		const bits = new THREE.Points(geo, new THREE.PointsMaterial({ color: RED, size: 0.28, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
		bits.frustumCulled = false;
		put(bits, lobby, home.x, 0, home.z);
		bits.visible = false;
		world.exploiters.push({ guy, bits, seeds, home, angle: a });
	}
	const pulse = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 64), new THREE.MeshBasicMaterial({ color: 0x9dffc4, transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
	pulse.rotation.x = -Math.PI / 2;
	pulse.visible = false;
	lobby.add(pulse);
	world.pulse = pulse;
	world.lobby = lobby;

	// ---------- office ----------
	const office = new THREE.Group();
	office.position.x = OX;
	scene.add(office);
	const officeFloor = new THREE.Mesh(new THREE.PlaneGeometry(26, 20), new THREE.MeshStandardMaterial({ color: 0x050a08, roughness: 0.35, metalness: 0.4 }));
	officeFloor.rotation.x = -Math.PI / 2;
	put(officeFloor, office, 0, -0.02, 2);
	put(gridLines(26, 20, 2, 2, DIM, 0.35), office, 0, 0, 2);
	put(edges(new THREE.BoxGeometry(26, 11, 20), GREEN, 0.35), office, 0, 5.5, 2);
	put(edges(new THREE.BoxGeometry(16, 6.5, 0.2), GREEN, 0.9), office, 0, 5.2, -8);
	for (const x of [-4, 0, 4]) put(edges(new THREE.BoxGeometry(0.1, 6.5, 0.2), GREEN, 0.5), office, x, 5.2, -8);
	const officeRain = new Rain(GREEN, 0.5, code.office, lite);
	world.rains.office = officeRain;
	world.rainSpeed = 1;
	for (let i = 0; i < 9; i++) {
		officeRain.sheet(office, -16 + i * 4 + Math.random(), 9, -10 - Math.random() * 9, 0, 26, 5);
	}
	put(wireBox(8, 0.18, 2.8, GREEN, 0x08120d), office, 0, 2.3, -1.2);
	for (const [x, z] of [[-3.7, -2.3], [3.7, -2.3], [-3.7, -0.1], [3.7, -0.1]]) put(wireBox(0.18, 2.2, 0.18, GREEN, 0x08120d, 0.6), office, x, 1.1, z);
	put(wireBox(2.2, 0.08, 0.7, GREEN, 0x0a1a12, 0.7), office, 0, 2.44, -0.5);
	put(wireBox(0.35, 0.45, 0.35, GREEN, 0x0a1a12, 0.7), office, -2.9, 2.62, -0.5);

	const codeLines = ['local Guard = require(RemoteGuard)', 'Remote.OnServerEvent:Connect(function(player, move)', '\tif not Guard.allow(player, "Move", 8, 4) then', '\t\treturn', '\tend', '\tif not canUse(player, move) then', '\t\treturn', '\tend', '\tCombat.fire(player, move)', 'end)', '', 'function Combat.fire(player, move)', '\tlocal hit = castFromServer(player, move)', '\tif hit then', '\t\tapplyKnockback(hit, move.power)', '\tend', 'end'];
	world.monitors = [];
	[-2.75, 0, 2.75].forEach((x, i) => {
		const mon = new THREE.Group();
		const tex = canvasTex(512, 300, (g, w, h) => {
			g.fillStyle = '#00130a';
			g.fillRect(0, 0, w, h);
			g.font = `15px ${MONO}`;
			for (let r = 0; r < 17; r++) {
				const text = codeLines[(r + i * 6) % codeLines.length].replace(/\t/g, '   ');
				g.fillStyle = 'rgba(0,255,102,0.4)';
				g.fillText(String(r + 1 + i * 40).padStart(3, ' '), 8, 20 + r * 17);
				g.fillStyle = r % 5 === 2 ? '#eafff2' : '#00ff66';
				g.fillText(text, 50, 20 + r * 17);
			}
		});
		const screen = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 1.46), new THREE.MeshBasicMaterial({ map: tex }));
		screen.position.z = 0.05;
		mon.add(screen);
		mon.add(wireBox(2.62, 1.58, 0.08, GREEN, 0x020403));
		put(wireBox(0.14, 0.5, 0.1, GREEN, 0x020403, 0.6), mon, 0, -1.02, -0.05);
		mon.rotation.y = -x * 0.14;
		put(mon, office, x, 3.65, -1.9 + Math.abs(x) * 0.12);
		world.monitors.push(screen);
	});

	const chair = new THREE.Group();
	put(wireBox(1.8, 0.2, 1.8, GREEN, 0x0b0f0d), chair, 0, 0.55, 0);
	put(wireBox(1.8, 2.6, 0.2, GREEN, 0x0b0f0d), chair, 0, 1.95, -1.0);
	for (const x of [-1, 1]) put(wireBox(0.16, 0.16, 1.4, GREEN, 0x0b0f0d, 0.6), chair, x, 1.25, -0.1);
	put(wireBox(0.2, 0.45, 0.2, GREEN, 0x0b0f0d, 0.6), chair, 0, 0.23, 0);
	put(wireBox(1.6, 0.08, 1.6, GREEN, 0x0b0f0d, 0.6), chair, 0, 0.04, 0);
	put(chair, office, 0, 0, 2.3);
	world.chair = chair;

	// shelf with a few things on it, and a game poster
	put(wireBox(0.9, 0.12, 5, GREEN, 0x08120d, 0.7), office, -12.4, 4.2, -2);
	[[-3.6, 0.9, FIRE], [-2.4, 0.6, 0x4ec3ff], [-1.2, 1.1, 0xe0b878], [-0.2, 0.7, GREEN]].forEach(([z, h, color]) => {
		put(wireBox(0.5, h, 0.5, color, 0x08120d), office, -12.4, 4.26 + h / 2, z);
	});
	const poster = textPlane(4.2, 5.6, (g, w, h) => {
		g.fillStyle = '#00130a';
		g.fillRect(0, 0, w, h);
		g.strokeStyle = '#00ff66';
		g.lineWidth = 6;
		g.strokeRect(3, 3, w - 6, h - 6);
		g.fillStyle = '#ff7a1a';
		g.beginPath();
		g.arc(w / 2 - 50, h * 0.38, 70, 0, Math.PI * 2);
		g.fill();
		g.fillStyle = '#e0b878';
		g.beginPath();
		g.arc(w / 2 + 50, h * 0.38, 70, 0, Math.PI * 2);
		g.fill();
		g.fillStyle = '#eafff2';
		g.font = 'bold 54px "Space Grotesk", Arial, sans-serif';
		g.textAlign = 'center';
		g.fillText('ELEMENTUM', w / 2, h * 0.72);
		g.fillStyle = '#00ff66';
		g.font = `22px ${MONO}`;
		g.fillText('PRO-BENDING', w / 2, h * 0.8);
	}, 80);
	poster.rotation.y = -Math.PI / 2;
	put(poster, office, 12.9, 5.4, -1);

	const phone = new THREE.Group();
	phone.add(wireBox(0.62, 0.07, 1.15, 0xeafff2, 0x050505));
	const phoneScreen = textPlane(0.54, 1.05, (g, w, h) => {
		g.fillStyle = '#00130a';
		g.fillRect(0, 0, w, h);
		g.fillStyle = '#00ff66';
		g.textAlign = 'center';
		g.font = `bold ${w * 0.16}px ${MONO}`;
		g.fillText('INCOMING', w / 2, h * 0.24);
		g.fillStyle = '#eafff2';
		g.font = `bold ${w * 0.2}px "Space Grotesk", Arial, sans-serif`;
		g.fillText('NEW', w / 2, h * 0.42);
		g.fillText('CLIENT', w / 2, h * 0.53);
		g.fillStyle = '#00ff66';
		g.beginPath();
		g.arc(w / 2, h * 0.78, w * 0.17, 0, Math.PI * 2);
		g.fill();
	}, 400);
	phoneScreen.rotation.x = -Math.PI / 2;
	phoneScreen.position.y = 0.04;
	phone.add(phoneScreen);
	const rings = [];
	for (let i = 0; i < 3; i++) {
		const ring = new THREE.Mesh(new THREE.RingGeometry(0.94, 1, 48), new THREE.MeshBasicMaterial({ color: GREEN, transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
		ring.rotation.x = -Math.PI / 2;
		ring.position.y = 0.06;
		phone.add(ring);
		rings.push(ring);
	}
	const phoneLight = new THREE.PointLight(GREEN, 0, 8);
	phoneLight.position.y = 0.8;
	phone.add(phoneLight);
	put(phone, office, 2.9, 2.44, -0.35);
	world.phone = { group: phone, rings, light: phoneLight, home: phone.position.clone() };
	put(new THREE.PointLight(0xffe2b0, 90, 30), office, -2, 8.5, 3);
	put(new THREE.PointLight(GREEN, 60, 20), office, 0, 4, -1);
	world.office = office;

	// beam used for every teleport
	const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 60, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0x9dffc4, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
	scene.add(beam);
	world.beam = beam;

	// bullet streak for the rifle
	const tracerGeo = new THREE.BoxGeometry(0.09, 0.09, 1);
	tracerGeo.translate(0, 0, 0.5);
	world.tracer = new THREE.Mesh(tracerGeo, new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
	world.tracer.visible = false;
	scene.add(world.tracer);

	const portals = [portalA, portalB];
	world.update = (time, dt) => {
		for (const t of codeTextures) t.tex.offset.y += t.speed * dt * world.rainSpeed;
		for (const h of world.holos) {
			h.uniforms.time.value += dt;
			h.beamMat.opacity = 0.26 + Math.sin(h.uniforms.time.value * 11) * 0.06;
		}
		for (const p of portals) {
			p.discs[0].rotation.z = time * 1.4;
			p.discs[1].rotation.z = -time * 0.9;
			p.outer.scale.setScalar(1 + Math.sin(time * 3) * 0.03);
		}
		crowd.material.opacity = 0.7 + Math.sin(time * 5) * 0.2;
	};
	return world;
}

export const COLORS = { GREEN, RED, FIRE, DIM };
