/* DentIA dental scene. A tooth is a parent group containing its crown and roots. */
(() => {
    'use strict';
    const COLORS = { CARIES: 0xdc5264, OBTURACION: 0x38a5d0, SELLANTE: 0x54ac85,
        CORONA: 0xd6a655, ENDODONCIA: 0xe58951, IMPLANTE: 0x9aabb8, RETENIDO: 0xc67cba };
    const materialsOf = mesh => Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const visible = object => { for (let p = object; p; p = p.parent) if (!p.visible) return false; return true; };

    class DentalViewer {
        constructor({ canvas, container = canvas.parentElement, modelUrl = 'assets/3d/dentia-articulado-v2.glb', onSelect = () => {}, onStatus = () => {} }) {
            if (!window.THREE?.GLTFLoader || !THREE.OrbitControls) throw new Error('No se pudo cargar el motor 3D.');
            this.canvas = canvas; this.container = container; this.onSelect = onSelect; this.onStatus = onStatus;
            this.teeth = new Map(); this.gums = []; this.roots = []; this.additional = [];
            this.findings = []; this.poses = []; this.selected = null; this.opening = 0.65;
            this.options = { gums: true, roots: true, additional: true, wireframe: false, arch: 'both' };
            this.events = new AbortController(); this.disposed = false;
            this.scene = new THREE.Scene();
            this.camera = new THREE.PerspectiveCamera(34, 1, 0.0001, 10);
            this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
            this.renderer.outputEncoding = THREE.sRGBEncoding;
            this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
            this.renderer.toneMappingExposure = 1.15;
            this.controls = new THREE.OrbitControls(this.camera, canvas);
            this.controls.enableDamping = true; this.controls.dampingFactor = 0.09;
            this.scene.add(new THREE.HemisphereLight(0xfff9ed, 0x637687, 0.85));
            [[0xfff5e9, 1.8, 1, 2, 3], [0xe2f1ff, 0.85, -2, 1, 1], [0xffffff, 1.1, 0, 1, -3]].forEach(([color, power, x, y, z]) => {
                const light = new THREE.DirectionalLight(color, power); light.position.set(x, y, z); this.scene.add(light);
            });
            this.raycaster = new THREE.Raycaster(); this.pointer = new THREE.Vector2();
            this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(container);
            this.bindPointer(); this.resize(); this.render();
            this.ready = this.load(modelUrl);
        }

        async load(url) {
            this.onStatus('Cargando modelo dental…', 'loading');
            try {
                const gltf = await new Promise((resolve, reject) => new THREE.GLTFLoader().load(url, resolve, undefined, reject));
                if (this.disposed) return;
                this.model = gltf.scene;
                this.model.traverse(object => {
                    const fdi = /^FDI_(\d{2})$/.exec(object.name);
                    if (fdi) {
                        const number = Number(fdi[1]); this.teeth.set(number, object);
                        object.userData.numeroPieza = number;
                        object.userData.basePosition = object.position.clone();
                        object.userData.baseQuaternion = object.quaternion.clone();
                    }
                    if (object.userData.additional) this.additional.push(object);
                    if (object.userData.part === 'gingiva') this.gums.push(object);
                    if (object.userData.part === 'roots') this.roots.push(object);
                    if (object.isMesh) {
                        object.material = Array.isArray(object.material) ? object.material.map(m => m.clone()) : object.material.clone();
                        materialsOf(object).forEach(m => { m.userData.baseColor = m.color.clone(); m.userData.baseMetalness = m.metalness; });
                    }
                });
                if (this.teeth.size !== 32) throw new Error('El archivo no contiene las 32 piezas FDI esperadas.');
                this.scene.add(this.model);
                // glTF already uses Y up and metres. No second Blender-axis conversion.
                const box = new THREE.Box3().setFromObject(this.model);
                this.center = box.getCenter(new THREE.Vector3());
                this.size = box.getSize(new THREE.Vector3()).length();
                this.distance = this.size / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) * 1.1;
                this.controls.minDistance = this.size * 0.3; this.controls.maxDistance = this.distance * 3;
                const clip = gltf.animations.find(c => c.tracks.some(t => /MANDIBULA/.test(t.name)));
                if (clip) {
                    // Only animate the mandible: tooth transforms remain independently editable.
                    this.jawClip = new THREE.AnimationClip('Apertura', clip.duration, clip.tracks.filter(t => /MANDIBULA/.test(t.name)));
                    this.mixer = new THREE.AnimationMixer(this.model); this.mixer.clipAction(this.jawClip).play();
                }
                this.setOpening(this.opening); this.setView('three-quarter'); this.applyState();
                this.onStatus('32 piezas dentales identificadas', 'ready');
                return this;
            } catch (error) {
                this.onStatus('No se pudo abrir el modelo 3D. Puedes continuar en el odontograma 2D.', 'error');
                throw error;
            }
        }

        resize() {
            const width = this.container.clientWidth, height = this.container.clientHeight;
            if (!width || !height || this.disposed) return;
            this.camera.aspect = width / height; this.camera.updateProjectionMatrix();
            this.renderer.setSize(width, height, false);
        }

        render() {
            if (this.disposed) return;
            this.frame = requestAnimationFrame(() => this.render());
            if (document.hidden || !this.canvas.getClientRects().length) return;
            this.controls.update(); this.renderer.render(this.scene, this.camera);
        }

        pick(event) {
            const rect = this.canvas.getBoundingClientRect();
            this.pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
            this.raycaster.setFromCamera(this.pointer, this.camera);
            for (const hit of this.raycaster.intersectObjects([...this.teeth.values()], true)) {
                if (!visible(hit.object)) continue;
                for (let p = hit.object; p; p = p.parent) if (p.userData.numeroPieza) return p.userData.numeroPieza;
            }
            return null;
        }

        bindPointer() {
            const options = { signal: this.events.signal };
            this.canvas.addEventListener('pointerdown', e => { this.down = { x: e.clientX, y: e.clientY }; }, options);
            this.canvas.addEventListener('pointerup', e => {
                if (!this.down || Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 5) return;
                const number = this.pick(e); if (number) this.select(number);
            }, options);
            this.canvas.addEventListener('pointermove', e => { this.canvas.style.cursor = this.pick(e) ? 'pointer' : 'grab'; }, options);
            this.canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.onStatus('Se perdió la vista 3D. Recarga la página para recuperarla.', 'error'); }, options);
        }

        select(number, notify = true) {
            if (!this.teeth.has(Number(number))) return;
            this.selected = Number(number); this.applyState();
            if (notify) this.onSelect(this.selected);
        }

        setData(findings = [], poses = []) { this.findings = findings; this.poses = poses; this.applyState(); }
        setOptions(options) { Object.assign(this.options, options); this.applyState(); }

        setOpening(value) {
            this.opening = Math.max(0, Math.min(1, Number(value) || 0));
            if (this.mixer) this.mixer.setTime(this.jawClip.duration * 0.5 * this.opening);
            this.applyState();
        }

        applyState() {
            this.gums.forEach(mesh => { mesh.visible = this.options.gums && (this.options.arch === 'both' || mesh.userData.arch === this.options.arch); });
            this.additional.forEach(group => { group.visible = this.options.additional && this.options.arch !== 'upper'; });
            this.roots.forEach(mesh => { mesh.visible = this.options.roots; });
            this.teeth.forEach((group, number) => {
                const findings = this.findings.filter(f => Number(f.numeroPieza) === number);
                const condition = findings.find(f => f.condicion === 'AUSENTE')?.condicion || findings.find(f => f.superficie === 'GENERAL')?.condicion || findings[0]?.condicion;
                const pose = this.poses.find(p => Number(p.numeroPieza) === number);
                group.position.copy(group.userData.basePosition); group.quaternion.copy(group.userData.baseQuaternion);
                if (pose) group.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), THREE.MathUtils.degToRad(Number(pose.inclinacion) || 0)));
                group.visible = condition !== 'AUSENTE' && (this.options.arch === 'both' || group.userData.arch === this.options.arch);
                group.traverse(mesh => {
                    if (!mesh.isMesh) return;
                    materialsOf(mesh).forEach(material => {
                        material.color.copy(material.userData.baseColor);
                        material.metalness = material.userData.baseMetalness;
                        if (mesh.userData.part === 'crown' && COLORS[condition]) material.color.setHex(COLORS[condition]);
                        material.wireframe = this.options.wireframe;
                        if (material.emissive) { material.emissive.setHex(number === this.selected ? 0x066b78 : 0); material.emissiveIntensity = 0.25; }
                    });
                });
            });
        }

        setView(view) {
            if (!this.center) return;
            const vectors = { front: [0, 0.08, 1], 'three-quarter': [0.6, 0.4, 1], upper: [0, -1, 0.05], lower: [0, 1, 0.05] };
            const direction = new THREE.Vector3(...(vectors[view] || vectors.front)).normalize();
            this.controls.target.copy(this.center);
            this.camera.position.copy(this.center).addScaledVector(direction, this.distance);
            this.camera.near = this.size / 200; this.camera.far = this.distance * 15;
            this.camera.updateProjectionMatrix(); this.controls.update(); this.resize();
        }

        orbit(horizontal, vertical = 0) {
            const relative = this.camera.position.clone().sub(this.controls.target);
            const spherical = new THREE.Spherical().setFromVector3(relative);
            spherical.theta += horizontal; spherical.phi = Math.max(0.05, Math.min(Math.PI - 0.05, spherical.phi + vertical));
            this.camera.position.copy(this.controls.target).add(new THREE.Vector3().setFromSpherical(spherical)); this.controls.update();
        }

        zoom(factor) {
            const relative = this.camera.position.clone().sub(this.controls.target);
            relative.setLength(Math.max(this.controls.minDistance, Math.min(this.controls.maxDistance, relative.length() * factor)));
            this.camera.position.copy(this.controls.target).add(relative); this.controls.update();
        }

        isolate(number, other) {
            const source = this.teeth.get(number); if (!source || !other) return;
            other.clear();
            const clone = source.clone(true); clone.visible = true; clone.position.set(0, 0, 0); clone.quaternion.identity();
            clone.traverse(mesh => { if (mesh.isMesh) { mesh.visible = true; mesh.material = materialsOf(mesh).map(m => m.clone()); if (mesh.material.length === 1) mesh.material = mesh.material[0]; } });
            other.add(clone);
            const box = new THREE.Box3().setFromObject(clone), center = box.getCenter(new THREE.Vector3());
            clone.position.sub(center);
            const scale = 2 / Math.max(...box.getSize(new THREE.Vector3()).toArray()); clone.scale.setScalar(scale); clone.position.multiplyScalar(scale);
        }

        dispose() {
            this.disposed = true; cancelAnimationFrame(this.frame); this.events.abort(); this.resizeObserver.disconnect(); this.controls.dispose();
            const geometries = new Set(), materials = new Set();
            this.scene.traverse(o => { if (o.isMesh) { geometries.add(o.geometry); materialsOf(o).forEach(m => materials.add(m)); } });
            geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); this.renderer.dispose();
        }
    }
    window.DentiaDentalViewer = DentalViewer;
})();
