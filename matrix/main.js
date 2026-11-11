import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildCharacter, loadAvatar, zeroPose, addPose, Poses } from './character.js';
import { buildWorld, AX, LX, OX, PORTAL_Z, COLORS } from './world.js';

const sat = (x) => Math.min(1, Math.max(0, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => {
	const t = sat((x - a) / (b - a));
	return t * t * (3 - 2 * t);
};
// 1 inside [a, b], fading over `fade` at both ends
const win = (x, a, b, fade) => Math.min(smooth(a, a + fade, x), 1 - smooth(b - fade, b, x));
const bump = (x) => smooth(0, 1, 1 - Math.abs(x));

// story beats, in scroll units (0-100)
const RUN0 = 13;
const RUN1 = 34.5;
const CUT_PORTAL = 35.5;
const COMBAT0 = 45;
const COMBAT1 = 58;
const CUT_LOBBY = 67;
const FIGHT0 = 74.5;
const FIGHT1 = 83.5;
const CUT_OFFICE = 85;
const HITS = [0.1, 0.24, 0.38, 0.52, 0.66, 0.8];
const HIT_MOVES = ['sideA', 'jump', 'matrix', 'sideB', 'jump', 'duck'];
const HIT_HEIGHT = [3.2, 0.9, 4.4, 3.2, 0.9, 4.4];
const KILLS = [0.14, 0.31, 0.48, 0.65, 0.82];
const BURST = 0.045;

const lite = Math.min(window.innerWidth, window.innerHeight) < 620 || /Android|iPhone|iPad/i.test(navigator.userAgent);

function runDist(u) {
	const x = Math.max(0, u - RUN0);
	return x < 1 ? 4 * x * x : 8 * (x - 0.5);
}

const camKeys = [
	{ u: 0, rel: true, p: [0, 3.2, 13], l: [0, 2.3, 0] },
	{ u: 4, rel: true, p: [0, 3, 11], l: [0, 2.1, 0] },
	{ u: 7.5, rel: true, p: [1.6, 3.2, 9], l: [-2.9, 3, 0] },
	{ u: 12, rel: true, p: [1.6, 3.2, 9], l: [-2.9, 3, 0] },
	{ u: 15.5, rel: true, p: [10.5, 3.4, -5.5], l: [-1.5, 3.2, 0.5] },
	{ u: 32.8, rel: true, p: [10.5, 3.4, -5.5], l: [-1.5, 3.2, 0.5] },
	{ u: 34.3, rel: true, p: [2.2, 4.4, 11], l: [0, 3.6, -10] },
	{ u: CUT_PORTAL, rel: true, p: [1.5, 4.2, 9], l: [0, 3.8, -10] },
	{ u: CUT_PORTAL, cut: true, p: [AX + 12, 4, 9], l: [AX, 3.5, 21] },
	{ u: 38.5, p: [AX + 17, 10, 27], l: [AX, 1.5, 3] },
	{ u: 44.5, p: [AX - 14, 8, 27], l: [AX + 2, 1.5, 2] },
	{ u: 46.5, p: [AX + 2.6, 6.2, 25.5], l: [AX - 5, 3.2, 0] },
	{ u: 57.5, p: [AX + 3.6, 5.8, 24.5], l: [AX - 5, 3.2, 0] },
	{ u: 59.6, p: [AX - 2, 4.8, 27], l: [AX - 5.5, 4.6, 10] },
	{ u: CUT_LOBBY, p: [AX - 2, 4.5, 26], l: [AX - 5.5, 4.4, 10] },
	{ u: CUT_LOBBY, cut: true, p: [LX + 1.6, 3.4, 11.5], l: [LX - 3.2, 3.1, 0] },
	{ u: 73, p: [LX + 2.4, 3.6, 10.5], l: [LX - 3.2, 3.1, 0] },
	{ u: 75.2, p: [LX + 10.5, 4.8, 3.5], l: [LX - 2.5, 2.7, -3.2] },
	{ u: FIGHT1, p: [LX + 9.5, 4.4, 5.5], l: [LX - 2.5, 2.7, -3.2] },
	{ u: CUT_OFFICE, p: [LX + 5, 5, 12], l: [LX, 2.5, 0] },
	{ u: CUT_OFFICE, cut: true, p: [OX - 10, 6, 14], l: [OX + 3.5, 2.5, 1] },
	{ u: 88.6, p: [OX - 7, 4.8, 12.5], l: [OX + 3.5, 2.6, 1.5] },
	{ u: 90.2, p: [OX + 2.6, 3.5, 10.4], l: [OX - 2.6, 2.9, 2.3] },
	{ u: 94.3, p: [OX + 3, 3.5, 10.2], l: [OX - 2.6, 2.9, 2.3] },
	{ u: 97, p: [OX + 6.2, 5.4, 4], l: [OX + 1.6, 2.5, -0.3] },
	{ u: 100, p: [OX + 5.8, 5, 3.4], l: [OX + 1.6, 2.5, -0.3] },
];

function charState(u, time, world) {
	const st = { x: 0, y: 0, z: 0, rot: 0, tele: 0 };
	const pose = zeroPose();
	const info = { dodged: 0, kills: 0, target: -1, firing: 0, gun: smooth(73.7, 74.5, u) * (1 - smooth(83.6, 84.1, u)) };

	if (u < CUT_PORTAL) {
		if (u < RUN0) {
			// starts with his head down under the cap, looks up as the page wakes, then hands go in the pockets
			st.rot = lerp(-0.32, Math.PI, smooth(11.8, 13, u));
			const cross = smooth(5.6, 7.4, u) * (1 - smooth(11.2, 12.2, u));
			addPose(pose, Poses.cool(time), 1 - cross);
			addPose(pose, Poses.pockets(time), cross);
			addPose(pose, { headX: 0.6 }, 1 - smooth(1.4, 4.4, u));
		} else if (u < RUN1) {
			const d = runDist(u);
			st.z = -d;
			st.rot = Math.PI;
			addPose(pose, Poses.run(d * 0.78), 1);
		} else {
			const t = (u - RUN1) / (CUT_PORTAL - RUN1);
			const d0 = runDist(RUN1);
			st.z = -lerp(d0, -PORTAL_Z + 1.5, t);
			st.y = Math.sin(t * Math.PI * 0.7) * 3.3;
			st.rot = Math.PI;
			const j = smooth(0, 0.3, t);
			addPose(pose, Poses.dive, j);
			addPose(pose, Poses.run(d0 * 0.78), 1 - j);
		}
	} else if (u < CUT_LOBBY) {
		st.x = AX;
		st.z = 10;
		st.rot = Math.PI;
		if (u < COMBAT0) {
			const t = sat((u - CUT_PORTAL) / 1.8);
			st.z = lerp(29, 10, 1 - (1 - t) * (1 - t));
			st.y = 2.6 * (1 - t * t);
			// lands on one knee, holds it, stands up, hands in pockets, until the fight starts
			const air = 1 - smooth(0.8, 1, t);
			const land = (1 - air) * (1 - smooth(CUT_PORTAL + 3.2, CUT_PORTAL + 4.2, u));
			const cross = smooth(CUT_PORTAL + 3.6, CUT_PORTAL + 4.6, u) * (1 - smooth(43.6, 44.6, u));
			addPose(pose, Poses.dive, air);
			addPose(pose, Poses.landing, land);
			addPose(pose, { headX: -0.45 }, land * smooth(CUT_PORTAL + 2.3, CUT_PORTAL + 3, u));
			addPose(pose, Poses.pockets(time), cross);
			addPose(pose, Poses.stance(time), Math.max(0, 1 - air - land - cross));
		} else if (u < COMBAT1) {
			const t = (u - COMBAT0) / (COMBAT1 - COMBAT0);
			let free = 1;
			let side = 0;
			HITS.forEach((h, i) => {
				const w = bump((t - h) / 0.06);
				if (t > h) info.dodged++;
				if (w <= 0) return;
				const move = HIT_MOVES[i];
				if (move === 'sideA') side -= 3.6 * w;
				if (move === 'sideB') side += 4.6 * w;
				if (move === 'jump') st.y += 2.7 * w;
				addPose(pose, Poses[move], w);
				free -= w;
			});
			const hit = win(t, 0.895, 0.975, 0.025);
			addPose(pose, Poses.punch, hit);
			addPose(pose, Poses.stance(time), Math.max(0, free - hit));
			st.x = AX - side;
		} else {
			const t = (u - COMBAT1) / (CUT_LOBBY - COMBAT1);
			st.rot = Math.PI * (1 - smooth(0, 0.1, t));
			// hands stay in his pockets, he only glances at each menu, then hits play with one hand
			const lookA = win(t, 0.1, 0.3, 0.05);
			const lookB = win(t, 0.3, 0.55, 0.05);
			const press = win(t, 0.72, 0.88, 0.04);
			const cross = smooth(0.04, 0.12, t) * (1 - press);
			addPose(pose, Poses.cool(time), 1 - cross);
			addPose(pose, Poses.pockets(time), cross);
			addPose(pose, { headY: -0.5 }, lookA);
			addPose(pose, { headY: 0.5 }, lookB);
			addPose(pose, { bShX: -1.45 }, press);
			st.tele = smooth(0.87, 1, t);
		}
	} else if (u < CUT_OFFICE) {
		st.x = LX;
		st.tele = Math.max(1 - smooth(CUT_LOBBY, CUT_LOBBY + 1, u), smooth(84, CUT_OFFICE, u));
		if (u < FIGHT0) {
			const turn = smooth(73, 74.4, u);
			st.rot = Math.PI * turn;
			addPose(pose, Poses.pockets(time), 1 - turn);
			addPose(pose, Poses.stance(time), turn * (1 - info.gun));
			addPose(pose, Poses.aim, info.gun);
			addPose(pose, { headY: Math.sin(time * 0.6) * 0.22 }, 1 - turn);
		} else {
			// stands his ground, turns to each exploiter and fires a burst
			const t = (u - FIGHT0) / (FIGHT1 - FIGHT0);
			let rot = Math.PI;
			let from = Math.PI;
			KILLS.forEach((k, i) => {
				const to = Math.PI - world.exploiters[i].angle;
				const t0 = i === 0 ? 0 : KILLS[i - 1] + 0.02;
				if (t >= t0) rot = lerp(from, to, smooth(t0, k - BURST - 0.012, t));
				from = to;
				if (t > k) info.kills++;
				const f = (t - (k - BURST)) / BURST;
				if (f >= 0 && f < 1) {
					info.target = i;
					info.firing = (f * 3) % 1 < 0.5 ? 1 : 0;
				}
			});
			const last = KILLS[KILLS.length - 1];
			if (t > last + 0.02) rot = lerp(from, Math.PI, smooth(last + 0.02, 0.97, t));
			st.rot = rot;
			addPose(pose, Poses.stance(time), 1 - info.gun);
			addPose(pose, Poses.aim, info.gun);
			addPose(pose, { lean: -0.07, bShX: 0.1, aShX: 0.1, headX: -0.05 }, info.firing || 0);
		}
	} else {
		st.tele = 1 - smooth(CUT_OFFICE, CUT_OFFICE + 1, u);
		const walk = smooth(86, 87.8, u);
		const sit = smooth(87.8, 88.8, u);
		st.x = OX + lerp(lerp(-7, -2.3, walk), 0, sit);
		st.z = lerp(lerp(5, 2.5, walk), 2.3, sit);
		st.rot = Math.PI * (0.5 + 0.5 * sit + smooth(88.9, 89.8, u) + smooth(94.3, 95.3, u));
		const walking = Math.sin(walk * Math.PI);
		addPose(pose, Poses.walk(walk * 16), walking);
		// sits down, then leans back while the prices are up
		const talk = win(u, 89.8, 94.2, 0.5);
		addPose(pose, Poses.sit, sit);
		addPose(pose, Poses.sitArms, sit);
		addPose(pose, Poses.cool(time), (1 - walking) * (1 - sit));
		addPose(pose, Poses.boss, talk);
		addPose(pose, Poses.reachA, smooth(95.2, 96.6, u));
	}
	return { st, pose, info };
}


// ---------- 2D rain shown before the world loads in ----------
function startBootRain(canvas, lines) {
	// real script lines falling down the screen, looping when they run out
	const g = canvas.getContext('2d');
	const code = lines && lines.length ? lines : ['local Players = game:GetService("Players")', 'Remote.OnServerEvent:Connect(onMove)', 'if not Guard.allow(player, "Move", 8, 4) then', '  return', 'end'];
	let size = 15;
	let cols = [];
	function resize() {
		canvas.width = window.innerWidth;
		canvas.height = window.innerHeight;
		size = window.innerWidth < 700 ? 12 : 15;
		const width = size * 0.6 * 42;
		cols = Array.from({ length: Math.ceil(canvas.width / width) }, (_, i) => ({ x: i * width + 8, offset: Math.random() * 4000, speed: 40 + Math.random() * 70, start: Math.floor(Math.random() * code.length) }));
	}
	resize();
	window.addEventListener('resize', resize);
	let last = 0;
	const state = { opacity: 1 };
	function tick(now) {
		requestAnimationFrame(tick);
		if (state.opacity < 0.01 || document.hidden || now - last < 33) return;
		const dt = Math.min(0.1, (now - last) / 1000);
		last = now;
		const step = size * 1.5;
		g.fillStyle = '#000';
		g.fillRect(0, 0, canvas.width, canvas.height);
		g.font = `${size}px "JetBrains Mono", monospace`;
		for (const col of cols) {
			col.offset += col.speed * dt;
			const shift = Math.floor(col.offset / step);
			const rows = Math.ceil(canvas.height / step) + 1;
			for (let r = 0; r < rows; r++) {
				const index = (((col.start + r - shift) % code.length) + code.length) % code.length;
				// brightness is fixed per line so it does not flicker
				const glow = ((index * 37) % 11) / 11;
				g.fillStyle = glow > 0.88 ? '#eafff2' : `rgba(0,255,102,${0.22 + glow * 0.6})`;
				g.fillText(code[index], col.x, r * step + (col.offset % step) - step * 0.3);
			}
		}
	}
	requestAnimationFrame(tick);
	return state;
}

// ---------- text cards ----------
function el(tag, cls, text) {
	const node = document.createElement(tag);
	if (cls) node.className = cls;
	if (text != null) node.textContent = text;
	return node;
}

function buildCards(story, host, onCode) {
	return story.cards.map((card) => {
		const node = el('section', `card side-${card.side}`);
		node.dataset.id = card.id;
		if (card.kicker) node.append(el('p', 'kicker', card.kicker));
		if (card.title) node.append(el(card.side === 'hero' ? 'h1' : 'h2', 'title', card.title));
		if (card.body) node.append(el('p', 'body', card.body));
		if (card.video) {
			const video = el('video');
			video.src = card.video;
			video.muted = true;
			video.loop = true;
			video.playsInline = true;
			video.preload = 'none';
			node.append(video);
			card.videoEl = video;
		}
		if (card.bullets) {
			const list = el('ul', 'bullets');
			card.bullets.forEach((b) => list.append(el('li', null, b)));
			node.append(list);
		}
		if (card.rows) {
			const table = el('div', 'rows');
			card.rows.forEach(([size, price, example]) => {
				const row = el('div', 'row');
				row.append(el('span', 'size', size), el('span', 'price', price), el('span', 'example', example));
				table.append(row);
			});
			node.append(table);
		}
		if (card.note) node.append(el('p', 'note', card.note));
		if (card.chips) {
			const chips = el('div', 'chips');
			card.chips.forEach((c) => chips.append(el('span', 'chip', c)));
			node.append(chips);
		}
		if (card.links) {
			const links = el('div', 'links');
			card.links.forEach((link) => {
				if (link.code) {
					// flies the camera to a wall of that script
					const btn = el('button', 'btn', link.label);
					btn.type = 'button';
					btn.addEventListener('click', () => onCode(link.code[0], link.code[1]));
					links.append(btn);
				} else if (link.copy) {
					const btn = el('button', 'btn', link.label);
					btn.type = 'button';
					btn.addEventListener('click', async () => {
						try {
							await navigator.clipboard.writeText(link.copy);
							btn.textContent = 'Copied!';
						} catch {
							btn.textContent = link.copy;
						}
						setTimeout(() => (btn.textContent = link.label), 1600);
					});
					links.append(btn);
				} else {
					const a = el('a', 'btn', link.label);
					a.href = link.href;
					if (/^https?:/.test(link.href)) {
						a.target = '_blank';
						a.rel = 'noopener';
					}
					links.append(a);
				}
			});
			node.append(links);
		}
		host.append(node);
		return { card, node, shown: false };
	});
}

async function main() {
	const story = await (await fetch('matrix/story.json')).json();
	const code = await fetch('matrix/code.json').then((r) => (r.ok ? r.json() : null)).catch(() => null);
	const $ = (id) => document.getElementById(id);
	const bootRain = startBootRain($('rain'), code ? Object.values(code).flat().flatMap((c) => c.lines) : null);
	let openCode = () => {};
	const cards = buildCards(story, $('cards'), (area, index) => openCode(area, index));

	// boot terminal types itself out on load
	const term = $('terminal');
	let typed = 0;
	const bootText = story.boot.map((l) => `> ${l}`).join('\n');
	const typer = setInterval(() => {
		typed++;
		term.textContent = bootText.slice(0, typed);
		if (typed >= bootText.length) clearInterval(typer);
	}, 38);

	const nav = $('nav');
	const maxScroll = () => document.documentElement.scrollHeight - window.innerHeight;
	const goTo = (u) => window.scrollTo({ top: (u / 100) * maxScroll(), behavior: 'smooth' });
	const dots = story.chapters.map((ch) => {
		const b = el('button', 'dot');
		b.type = 'button';
		b.title = ch.label;
		b.setAttribute('aria-label', ch.label);
		b.append(el('span', null, ch.label));
		b.addEventListener('click', () => goTo(ch.at));
		nav.append(b);
		return b;
	});
	$('contactBtn').addEventListener('click', () => goTo(98));

	try {
		await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 2500))]);
	} catch {}

	let renderer;
	try {
		renderer = new THREE.WebGLRenderer({ canvas: $('scene'), antialias: !lite, powerPreference: 'high-performance' });
	} catch {
		document.body.classList.add('no-webgl');
		return;
	}
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, lite ? 1.5 : 2));
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	renderer.toneMappingExposure = 1.15;

	const scene = new THREE.Scene();
	scene.background = new THREE.Color(0x000302);
	scene.fog = new THREE.FogExp2(0x000302, 0.011);
	const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
	scene.add(new THREE.HemisphereLight(0xc8ffe0, 0x003318, 1.0));
	const key = new THREE.DirectionalLight(0xffffff, 3.4);
	scene.add(key, key.target);
	const rim = new THREE.PointLight(COLORS.GREEN, 90, 26);
	scene.add(rim);

	const world = buildWorld(scene, story, lite, code);
	const avatar = await loadAvatar('matrix/avatar/');
	const hero = buildCharacter(avatar);
	if (avatar) key.intensity = 2.3;
	scene.add(hero.root);

	let composer = null;
	if (!lite) {
		composer = new EffectComposer(renderer);
		composer.addPass(new RenderPass(scene, camera));
		composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.7, 0.55, 0.2));
		composer.addPass(new OutputPass());
	}
	function resize() {
		const w = window.innerWidth;
		const h = window.innerHeight;
		renderer.setSize(w, h, false);
		if (composer) composer.setSize(w, h);
		camera.aspect = w / h;
		camera.fov = lerp(66, 50, sat((w / h - 0.45) / 0.6));
		camera.updateProjectionMatrix();
	}
	resize();
	window.addEventListener('resize', resize);

	const mouse = { x: 0, y: 0 };
	window.addEventListener('pointermove', (e) => {
		mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
		mouse.y = (e.clientY / window.innerHeight) * 2 - 1;
	});

	const query = new URLSearchParams(location.search);
	if (query.has('u')) window.scrollTo(0, (parseFloat(query.get('u')) / 100) * maxScroll());

	const green = new THREE.Color(COLORS.GREEN);
	const red = new THREE.Color(COLORS.RED);
	const tmpColor = new THREE.Color();
	const camPos = new THREE.Vector3();
	const camLook = new THREE.Vector3();
	const va = new THREE.Vector3();
	const vb = new THREE.Vector3();
	const hud = { chapter: $('chapter'), bar: $('bar'), stat: $('stat'), flash: $('flash'), alert: $('alert'), hint: $('hint'), rain: $('rain'), boot: $('boot') };
	let cur = (window.scrollY / Math.max(1, maxScroll())) * 100;
	let lastNow = performance.now();
	let lastChapter = -1;
	document.body.classList.add('ready');

	// code view: which wall sheet the camera is parked at
	const focus = { on: false, k: 0, pos: new THREE.Vector3(), look: new THREE.Vector3(), rain: null, index: 0, scrollAt: 0, sheet: null, alone: false };
	// while a script is being read, every other wall sheet and the crowd lights step out of the way
	function showOnlyFocus(alone) {
		focus.alone = alone;
		for (const rain of Object.values(world.rains)) {
			for (const list of rain.sheets) for (const sheet of list) sheet.visible = !alone || sheet === focus.sheet;
		}
		world.crowd.visible = !alone;
	}
	const codeBar = $('codebar');
	function closeCode() {
		focus.on = false;
		codeBar.hidden = true;
	}
	openCode = (area, index) => {
		const rain = world.rains[area];
		if (!rain) return;
		const i = index % rain.sheets.length;
		// take the sheet of that script closest to where the camera is looking
		camera.getWorldDirection(va);
		vb.copy(camera.position).addScaledVector(va, 30);
		let best = null;
		let bestDist = Infinity;
		for (const sheet of rain.sheets[i]) {
			const d = sheet.getWorldPosition(va).distanceTo(vb);
			if (d < bestDist) {
				bestDist = d;
				best = sheet;
			}
		}
		if (!best) return;
		if (focus.alone) showOnlyFocus(false);
		focus.sheet = best;
		if (focus.rain && focus.rain !== rain) {
			focus.rain.boost.fill(0);
			focus.rain.apply();
		}
		const w = best.userData.w;
		const wide = Math.max(w * 1.08, w * 1.125 * camera.aspect);
		const dist = wide / 2 / (Math.tan((camera.fov * Math.PI) / 360) * camera.aspect);
		best.getWorldPosition(focus.look);
		focus.look.y = focus.look.y - best.userData.h / 2 + 9;
		best.getWorldDirection(va);
		focus.pos.copy(focus.look).addScaledVector(va, dist);
		focus.rain = rain;
		focus.index = i;
		focus.on = true;
		focus.scrollAt = window.scrollY;
		$('codefile').textContent = rain.files[i];
		codeBar.hidden = false;
	};
	$('codeback').addEventListener('click', closeCode);
	window.addEventListener('keydown', (e) => {
		if (e.key === 'Escape') closeCode();
	});
	window.addEventListener('scroll', () => {
		if (focus.on && Math.abs(window.scrollY - focus.scrollAt) > 40) closeCode();
	}, { passive: true });

	function keyPoint(k, st, pos, look) {
		pos.set(k.p[0], k.p[1], k.p[2]);
		look.set(k.l[0], k.l[1], k.l[2]);
		if (k.rel) {
			pos.x += st.x;
			pos.z += st.z;
			look.x += st.x;
			look.z += st.z;
		}
	}

	function frame(now) {
		requestAnimationFrame(frame);
		if (document.hidden) return;
		const dt = Math.min(0.05, (now - lastNow) / 1000);
		lastNow = now;
		const time = now / 1000;
		const target = (window.scrollY / Math.max(1, maxScroll())) * 100;
		cur += (target - cur) * Math.min(1, dt * 7);
		if (Math.abs(target - cur) < 0.001) cur = target;
		const u = cur;

		// hero
		const { st, pose, info } = charState(u, time, world);
		hero.root.position.set(st.x, st.y, st.z);
		hero.root.rotation.y = st.rot;
		hero.root.scale.set(1 - st.tele * 0.96, 1 + st.tele * 2.6, 1 - st.tele * 0.96);
		hero.setPose(pose);
		const gun = hero.gun;
		gun.group.visible = info.gun > 0.01;
		if (gun.group.visible) {
			const g = info.gun;
			gun.group.scale.setScalar(g * (1 + Math.sin(g * Math.PI) * 0.35));
			gun.group.rotation.z = (1 - g) * 5;
			gun.group.position.copy(gun.home);
			gun.group.position.z -= info.firing * 0.14;
			gun.summonLight.intensity = Math.sin(g * Math.PI) * 120;
			gun.flash.visible = info.firing > 0;
			gun.flash.rotation.z = Math.random() * 3;
			gun.flash.scale.setScalar(0.7 + Math.random() * 0.6);
			gun.flashLight.intensity = info.firing * 90;
		}
		world.beam.position.set(st.x, 28, st.z);
		world.beam.material.opacity = st.tele * 0.75;
		world.beam.visible = st.tele > 0.01;

		// camera
		let i = 0;
		while (i < camKeys.length - 1 && camKeys[i + 1].u <= u) i++;
		const a = camKeys[i];
		const b = camKeys[Math.min(i + 1, camKeys.length - 1)];
		keyPoint(a, st, camPos, camLook);
		if (b !== a && !b.cut) {
			const k = smooth(a.u, b.u, u);
			keyPoint(b, st, va, vb);
			camPos.lerp(va, k);
			camLook.lerp(vb, k);
		}
		if (camera.aspect < 1.25) {
			// tall screens: step back a bit, centre on the character and lift him above the text card
			const tall = sat((1.25 - camera.aspect) / 0.8);
			if (u < 95.5) {
				const follow = 0.6 * tall;
				const dx = (st.x - camLook.x) * follow;
				const dz = (st.z - camLook.z) * follow;
				camLook.x += dx;
				camLook.z += dz;
				camPos.x += dx * 0.5;
				camPos.z += dz * 0.5;
			}
			camPos.sub(camLook).multiplyScalar(1 + tall * 0.45).add(camLook);
			camLook.y -= camPos.distanceTo(camLook) * 0.16 * tall;
		}
		// reading a script: glide over to its wall sheet and back
		focus.k = sat(focus.k + (focus.on ? dt : -dt) / 0.9);
		const reading = smooth(0, 1, focus.k);
		if (reading > 0) {
			camPos.lerp(focus.pos, reading);
			camLook.lerp(focus.look, reading);
		}
		if (focus.rain) {
			focus.rain.boost.fill(0);
			focus.rain.boost[focus.index] = reading * 0.9;
			focus.rain.apply();
			if (focus.k === 0) focus.rain = null;
		}
		world.rainSpeed = 1 - reading * 0.55;
		if (focus.k > 0.5 !== focus.alone) showOnlyFocus(focus.k > 0.5);
		camera.position.copy(camPos);
		camera.lookAt(camLook);
		camera.translateX(mouse.x * 0.45 * (1 - reading));
		camera.translateY(-mouse.y * 0.25 * (1 - reading));
		camera.lookAt(camLook);
		key.position.copy(camera.position).add(va.set(3, 5, 0));
		key.target.position.set(st.x, st.y + 3, st.z);
		va.set(st.x - camera.position.x, 0, st.z - camera.position.z).normalize();
		rim.position.set(st.x + va.x * 4, st.y + 6, st.z + va.z * 4);

		// scenes
		world.corridor.visible = u < CUT_PORTAL;
		world.holos.forEach((h, n) => {
			if (!h.video) return;
			// only the hologram he is running past plays
			const at = 18.8 + n * 4.4;
			const want = u > at - 4.5 && u < at + 3 && u < CUT_PORTAL;
			if (want && h.video.paused) h.video.play().catch(() => {});
			if (!want && !h.video.paused) h.video.pause();
		});
		world.arena.visible = u >= CUT_PORTAL && u < CUT_LOBBY;
		world.lobby.visible = u >= CUT_LOBBY && u < CUT_OFFICE;
		if (!world.lobby.visible) world.tracer.visible = false;
		world.office.visible = u >= CUT_OFFICE;
		world.update(time, dt);

		if (world.arena.visible) {
			world.exitPortal.visible = u < 39.5;
			const t = (u - COMBAT0) / (COMBAT1 - COMBAT0);
			const throwing = [0, 0];
			world.shots.forEach((shot, n) => {
				const g = shot.group;
				let s;
				let end = 0.73;
				if (n === 6) {
					s = (t - 0.925) / 0.04;
					end = 1;
					va.set(lerp(0, -4.5, s), 3.3, lerp(8.4, -14, s));
					vb.set(-4.5, 0, -22.4);
				} else {
					s = (t - (HITS[n] - 0.085)) / 0.15;
					const from = n % 2 ? 4.5 : -4.5;
					throwing[n % 2] = Math.max(throwing[n % 2], bump((s + 0.08) / 0.3));
					const k = s / 0.56;
					va.set(lerp(from, 0, k), Math.max(shot.kind === 'earth' ? 0.3 : 0.5, lerp(3.6, HIT_HEIGHT[n], k)), lerp(-13, 10, k));
					vb.set(-from, HIT_HEIGHT[n] - 3.6, 23);
					if (s > -0.3 && s < 0) world.fx.windup(shot.kind, [from, 5.3, -13.2], dt);
				}
				const on = s > 0 && s < end;
				g.visible = on;
				if (on) {
					g.position.copy(va);
					if (shot.kind === 'fire') {
						vb.normalize();
						g.lookAt(AX + va.x + vb.x, va.y + vb.y, va.z + vb.z);
					}
				}
				// burst where the attack ends, only when scrolling forward through that moment
				if (shot.prev < end && s >= end && s - shot.prev < 0.6) {
					const at = [va.x, va.y, va.z];
					if (shot.kind === 'fire') world.fx.fireImpact(at, shot.heavy);
					else world.fx.earthImpact(at, shot.heavy);
				}
				shot.prev = s;
				shot.update(dt, on);
			});
			world.fx.castRing([st.x - AX, 0, st.z], win(t, 0.885, 0.94, 0.02), dt);
			world.fx.update(dt, renderer.domElement.height / (2 * Math.tan((camera.fov * Math.PI) / 360)));
			const ko = sat((t - 0.965) / 0.035);
			world.bots.forEach((bot, n) => {
				bot.parts.armB.rotation.x = -2.9 * throwing[n];
				bot.parts.armA.rotation.x = -0.4 - Math.sin(time * 3 + n) * 0.2;
				bot.body.position.y = 2 + Math.sin(time * 4 + n * 2) * 0.08;
				if (n === 0) {
					bot.root.position.set(-4.5, ko * 4 - ko * ko * 9, -14 - ko * 13);
					bot.root.rotation.x = -ko * 1.6;
				}
			});

			const tu = (u - COMBAT1) / (CUT_LOBBY - COMBAT1);
			const spots = [[-5.3, 4.2, 11.4, 0.4], [4.9, 4.2, 11.4, -0.45], [0, 8.5, 9.4, 0]];
			world.menus.forEach((menu, n) => {
				const open = smooth(0.08 + n * 0.1, 0.16 + n * 0.1, tu) * (1 - smooth(0.6, 0.68, tu));
				menu.visible = open > 0.01;
				const pop = open * (1 + Math.sin(open * Math.PI) * 0.12);
				menu.scale.setScalar(Math.max(0.001, pop));
				menu.position.set(spots[n][0], spots[n][1] + Math.sin(time * 1.3 + n) * 0.12, spots[n][2]);
				menu.rotation.y = spots[n][3];
				menu.rotation.x = n === 2 ? 0.25 : 0;
			});
			const btn = world.playButton;
			const show = smooth(0.66, 0.73, tu) * (1 - smooth(0.9, 0.97, tu));
			btn.visible = show > 0.01;
			btn.position.set(0, 3.5, 12.4);
			btn.scale.setScalar(Math.max(0.001, show * (1 - bump((tu - 0.8) / 0.03) * 0.18)));
		}

		if (world.lobby.visible) {
			const danger = smooth(73.2, 74.2, u) * (1 - smooth(83.6, 84.4, u));
			tmpColor.copy(green).lerp(red, danger);
			world.lobbyRain.setColor(green, 1 - danger);
			world.guardRain.setColor(red, danger);
			world.lobbyLines.forEach((l) => l.material.color.copy(tmpColor));
			world.lobbyLight.color.set(0xcfffe0).lerp(red, danger * 0.7);
			world.dangerLight.intensity = danger * 160;
			const t = (u - FIGHT0) / (FIGHT1 - FIGHT0);
			let pulseAge = 99;
			world.exploiters.forEach((e, n) => {
				const spawn = smooth(73.3 + n * 0.18, 73.7 + n * 0.18, u);
				const age = (t - KILLS[n]) * 13;
				const alive = spawn > 0.02 && age < 0;
				e.guy.root.visible = alive;
				if (alive) {
					const jit = Math.random() < 0.08 ? 0.5 : 0.04;
					const near = smooth(KILLS[n] - 0.2, KILLS[n], t);
					e.guy.root.position.set(e.home.x * (1 - near * 0.22) + (Math.random() - 0.5) * jit, 0, e.home.z * (1 - near * 0.22) + (Math.random() - 0.5) * jit);
					e.guy.root.scale.set(1, spawn, 1);
					e.guy.parts.armA.rotation.x = -2.4 + Math.sin(time * 6 + n) * 0.3;
					e.guy.parts.armB.rotation.x = -2.4 + Math.cos(time * 5 + n) * 0.3;
					e.guy.line.opacity = 0.6 + Math.random() * 0.4;
				}
				e.bits.visible = age >= 0 && age < 4;
				if (e.bits.visible) {
					const pos = e.bits.geometry.attributes.position;
					e.seeds.forEach((s, j) => {
						pos.setXYZ(j, s.o.x + s.v.x * age * 0.5, Math.max(0.05, s.o.y + s.v.y * age * 0.5 - 4.5 * age * age), s.o.z + s.v.z * age * 0.5);
					});
					pos.needsUpdate = true;
					e.bits.material.opacity = sat(1 - age / 4);
					if (age < pulseAge) {
						pulseAge = age;
						world.pulse.position.set(e.home.x * 0.78, 0.08, e.home.z * 0.78);
					}
				}
			});
			const shot = info.firing > 0 && info.target >= 0;
			world.tracer.visible = shot;
			if (shot) {
				const e = world.exploiters[info.target];
				hero.root.updateMatrixWorld(true);
				hero.gun.muzzle.getWorldPosition(va);
				vb.set(LX + e.home.x * 0.78 + (Math.random() - 0.5) * 0.8, 2.4 + Math.random() * 1.6, e.home.z * 0.78);
				world.tracer.position.copy(va);
				world.tracer.lookAt(vb);
				world.tracer.scale.set(1, 1, va.distanceTo(vb));
			}
			world.pulse.visible = pulseAge < 1.6;
			if (world.pulse.visible) {
				world.pulse.scale.setScalar(1 + pulseAge * 6);
				world.pulse.material.opacity = sat(1 - pulseAge / 1.6);
			}
		}

		if (world.office.visible) {
			world.chair.rotation.y = st.rot;
			world.chair.position.set(0, 0, 2.3);
			const ring = smooth(93.6, 94.4, u);
			const buzz = (time * 0.8) % 1 < 0.62 ? 1 : 0;
			const ph = world.phone;
			ph.group.position.copy(ph.home);
			ph.group.position.x += Math.sin(time * 70) * 0.012 * ring * buzz;
			ph.group.rotation.y = 0.25 + Math.sin(time * 55) * 0.05 * ring * buzz;
			ph.light.intensity = ring * (10 + buzz * 25);
			ph.rings.forEach((r, n) => {
				const f = (time * 0.8 + n / 3) % 1;
				r.scale.setScalar(0.45 + f * 1.5);
				r.material.opacity = (1 - f) * ring * 0.9;
			});
		}

		// overlays
		for (const c of cards) {
			const [from, to] = c.card.at;
			const o = win(u, from, to, 0.7) * (1 - reading);
			const shown = o > 0.01;
			if (shown !== c.shown) {
				c.shown = shown;
				c.node.classList.toggle('on', shown);
				if (c.card.videoEl) shown ? c.card.videoEl.play().catch(() => {}) : c.card.videoEl.pause();
			}
			if (shown) {
				c.node.style.opacity = o.toFixed(3);
				c.node.style.setProperty('--shift', `${((1 - o) * 26).toFixed(1)}px`);
				c.node.style.pointerEvents = o > 0.6 ? 'auto' : 'none';
			}
		}
		const rainOpacity = 1 - smooth(0.8, 4.5, u);
		hud.rain.style.opacity = rainOpacity.toFixed(3);
		bootRain.opacity = rainOpacity;
		hud.boot.style.opacity = (1 - smooth(0.4, 1.6, u)).toFixed(3);
		hud.hint.style.opacity = (1 - smooth(0.3, 1.2, u)).toFixed(3);
		let flash = 0;
		for (const cut of [CUT_PORTAL, CUT_LOBBY, CUT_OFFICE]) flash = Math.max(flash, 1 - Math.abs(u - cut) / 0.45);
		hud.flash.style.opacity = sat(flash).toFixed(3);
		const danger = smooth(73.2, 74, u) * (1 - smooth(83.6, 84.4, u));
		hud.alert.style.opacity = (danger * (0.55 + (Math.random() < 0.06 ? 0.4 : 0))).toFixed(3);
		document.body.classList.toggle('danger', danger > 0.5);

		let ch = 0;
		story.chapters.forEach((c, n) => {
			if (u >= c.at - 1.6) ch = n;
		});
		if (ch !== lastChapter) {
			lastChapter = ch;
			hud.chapter.textContent = `${String(ch + 1).padStart(2, '0')} / ${String(story.chapters.length).padStart(2, '0')}  ${story.chapters[ch].label}`;
			dots.forEach((d, n) => d.classList.toggle('active', n === ch));
		}
		hud.bar.style.transform = `scaleX(${(u / 100).toFixed(4)})`;
		let stat = '';
		if (u > COMBAT0 + 0.5 && u < COMBAT1 + 0.6) stat = `DODGED ${info.dodged} / ${HITS.length}`;
		if (u > 73.6 && u < 84.4) stat = `EXPLOITERS REMOVED ${info.kills} / ${KILLS.length}`;
		if (reading > 0.3) stat = '';
		if (hud.stat.textContent !== stat) hud.stat.textContent = stat;

		if (composer) composer.render();
		else renderer.render(scene, camera);
	}
	requestAnimationFrame(frame);
	window.__portfolio = { goTo, hero, get u() { return cur; } };
}

main();
