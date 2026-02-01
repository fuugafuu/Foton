const WEAPONS={
        ar:{name:'アサルトライフル',damage:32,fireRate:0.1,range:100,spread:0.02,mag:30,reload:2.2,ammo:'medium',rarity:'uncommon'},
        smg:{name:'サブマシンガン',damage:19,fireRate:0.07,range:50,spread:0.04,mag:35,reload:1.8,ammo:'light',rarity:'common'},
        shotgun:{name:'ショットガン',damage:85,fireRate:0.9,range:30,spread:0.15,mag:8,reload:0.5,ammo:'shells',rarity:'rare'},
        sniper:{name:'スナイパーライフル',damage:120,fireRate:1.5,range:300,spread:0,mag:5,reload:3,ammo:'heavy',rarity:'epic'},
        pistol:{name:'ピストル',damage:26,fireRate:0.15,range:60,spread:0.01,mag:16,reload:1.5,ammo:'light',rarity:'common'}
    };
    const HEALING={
        bandage:{name:'包帯',heal:15,time:3,max:75},
        medkit:{name:'医療キット',heal:100,time:8,max:100},
        shield:{name:'シールドポーション',heal:50,time:4,shield:true},
        bigshield:{name:'大シールド',heal:100,time:6,shield:true}
    };
    const AMMO={light:{name:'軽弾薬',icon:'○'},medium:{name:'中弾薬',icon:'●'},heavy:{name:'重弾薬',icon:'◆'},shells:{name:'ショットガン弾',icon:'◇'}};
    const MATS=['wood','stone','metal'];
    
    class Game{
        constructor(){
            this.state='loading';
            this.settings={mapSize:500,enemyCount:99};
            this.selectedMode='solo';
            this.init();
        }
        async init(){
            await this.load();
            this.setupLobby();
            document.getElementById('loading-screen').style.display='none';
            document.getElementById('lobby-screen').style.display='flex';
        }
        async load(){
            const bar=document.getElementById('loading-bar');
            const text=document.getElementById('loading-text');
            const steps=['マップ生成中...','武器読み込み中...','敵AI初期化中...','最終確認中...'];
            for(let i=0;i<steps.length;i++){
                text.textContent=steps[i];
                bar.style.width=`${((i+1)/steps.length)*100}%`;
                await new Promise(r=>setTimeout(r,300+Math.random()*400));
            }
        }
        setupLobby(){
            document.querySelectorAll('.mode-card').forEach(card=>{
                card.addEventListener('click',()=>{
                    document.querySelectorAll('.mode-card').forEach(c=>c.classList.remove('selected'));
                    card.classList.add('selected');
                    this.selectedMode=card.dataset.mode;
                });
            });
        }
        startGame(){
            document.getElementById('lobby-screen').style.display='none';
            document.getElementById('game-container').style.display='block';
            document.getElementById('hud').style.display='block';
            document.getElementById('controls').style.display='block';
            document.getElementById('crosshair').style.display='block';
            
            if(this.selectedMode==='fast')this.settings.stormSpeed=2;
            else if(this.selectedMode==='hardcore')this.settings.hardcoreMode=true;
            
            this.initThree();
            this.initGame();
            this.setupControls();
            this.state='playing';
            this.startTime=Date.now();
            this.loop();
        }
        returnToLobby(){
            this.reset();
            document.getElementById('gameover-screen').style.display='none';
            document.getElementById('lobby-screen').style.display='flex';
            this.state='lobby';
        }
        initThree(){
            this.scene=new THREE.Scene();
            this.scene.background=new THREE.Color(0x87ceeb);
            this.scene.fog=new THREE.Fog(0x87ceeb,100,350);
            
            this.camera=new THREE.PerspectiveCamera(75,window.innerWidth/window.innerHeight,0.1,1000);
            
            this.renderer=new THREE.WebGLRenderer({canvas:document.getElementById('game-canvas'),antialias:false});
            this.renderer.setSize(window.innerWidth,window.innerHeight);
            this.renderer.shadowMap.enabled=true;
            this.renderer.shadowMap.type=THREE.BasicShadowMap;
            
            const ambient=new THREE.AmbientLight(0xffffff,0.7);
            this.scene.add(ambient);
            const sun=new THREE.DirectionalLight(0xffffee,0.8);
            sun.position.set(100,200,50);
            sun.castShadow=true;
            sun.shadow.camera.left=-150;sun.shadow.camera.right=150;
            sun.shadow.camera.top=150;sun.shadow.camera.bottom=-150;
            sun.shadow.mapSize.width=1024;sun.shadow.mapSize.height=1024;
            this.scene.add(sun);
            
            this.clock=new THREE.Clock();
        }
        initGame(){
            this.player={
                pos:new THREE.Vector3(0,50,0),
                vel:new THREE.Vector3(),
                rot:0,pitch:0,
                hp:100,shield:100,
                inv:[null,null,null,null,null],
                slot:0,
                ammo:{light:60,medium:60,heavy:10,shells:15},
                mats:{wood:0,stone:0,metal:0},
                kills:0,dmgDealt:0,
                aim:false,reload:false,reloadEnd:0,
                mag:{},
                building:false,buildType:'wall',
                ground:true,
                height:1.8
            };
            
            this.enemies=[];
            this.loot=[];
            this.buildings=[];
            this.bullets=[];
            this.chests=[];
            this.structures=[];
            this.obstacles=[];
            this.alive=100;
            this.nearItem=null;
            this.player.lastShot=0;
            this.player.lastBuild=0;
            
            this.storm={
                radius:this.settings.mapSize*0.8,
                target:this.settings.mapSize*0.8,
                cx:0,cz:0,
                speed:0,
                phase:0,
                nextTime:120,
                dmg:1
            };
            
            this.input={mx:0,my:0,fire:false,aim:false,jump:false,reload:false,build:false,camX:0,camY:0};
            
            this.createTerrain();
            this.createPlayer();
            this.spawnBuildings();
            this.spawnObstacles();
            this.spawnChests();
            this.spawnEnemies();
            this.updateUI();
            
            this.mmCanvas=document.getElementById('minimap');
            this.mmCtx=this.mmCanvas.getContext('2d');
        }
        createTerrain(){
            const size=this.settings.mapSize;
            const geo=new THREE.PlaneGeometry(size,size,80,80);
            geo.rotateX(-Math.PI/2);
            
            const pos=geo.attributes.position;
            for(let i=0;i<pos.count;i++){
                const x=pos.getX(i),z=pos.getZ(i);
                const h=this.terrain(x,z);
                pos.setY(i,h);
            }
            pos.needsUpdate=true;
            geo.computeVertexNormals();
            
            const mat=new THREE.MeshLambertMaterial({color:0x228b22,flatShading:true});
            this.ground=new THREE.Mesh(geo,mat);
            this.ground.receiveShadow=true;
            this.scene.add(this.ground);
            
            this.terrainData={size,segments:80};
        }
        terrain(x,z){
            const n=(Math.sin(x*0.02)+Math.cos(z*0.03)+Math.sin((x+z)*0.015))*3;
            return Math.max(0,n);
        }
        getTerrainHeight(x,z){
            const size=this.settings.mapSize;
            const segments=this.terrainData.segments;
            const halfSize=size/2;
            
            if(Math.abs(x)>halfSize||Math.abs(z)>halfSize)return 0;
            
            const gridX=((x+halfSize)/size)*segments;
            const gridZ=((z+halfSize)/size)*segments;
            
            const x0=Math.floor(gridX),x1=Math.ceil(gridX);
            const z0=Math.floor(gridZ),z1=Math.ceil(gridZ);
            
            const h00=this.terrain((x0/segments*size)-halfSize,(z0/segments*size)-halfSize);
            const h10=this.terrain((x1/segments*size)-halfSize,(z0/segments*size)-halfSize);
            const h01=this.terrain((x0/segments*size)-halfSize,(z1/segments*size)-halfSize);
            const h11=this.terrain((x1/segments*size)-halfSize,(z1/segments*size)-halfSize);
            
            const fx=gridX-x0,fz=gridZ-z0;
            const h0=h00*(1-fx)+h10*fx;
            const h1=h01*(1-fx)+h11*fx;
            
            return h0*(1-fz)+h1*fz;
        }
        createPlayer(){
            const geo=new THREE.BoxGeometry(0.8,1.8,0.8);
            const mat=new THREE.MeshLambertMaterial({color:0x00f5ff});
            this.playerMesh=new THREE.Mesh(geo,mat);
            this.playerMesh.castShadow=true;
            
            const groundHeight=this.getTerrainHeight(this.player.pos.x,this.player.pos.z);
            this.player.pos.y=groundHeight+this.player.height;
            this.playerMesh.position.copy(this.player.pos);
            
            this.scene.add(this.playerMesh);
        }
        spawnBuildings(){
            const count=20;
            for(let i=0;i<count;i++){
                const x=(Math.random()-0.5)*this.settings.mapSize*0.6;
                const z=(Math.random()-0.5)*this.settings.mapSize*0.6;
                const w=6+Math.random()*8;
                const h=8+Math.random()*12;
                const d=6+Math.random()*8;
                const groundH=this.getTerrainHeight(x,z);
                
                // 建物本体
                const houseGeo=new THREE.BoxGeometry(w,h,d);
                const houseMat=new THREE.MeshLambertMaterial({color:0x8b7355});
                const house=new THREE.Mesh(houseGeo,houseMat);
                house.position.set(x,groundH+h/2,z);
                house.castShadow=true;
                house.receiveShadow=true;
                this.scene.add(house);
                
                // 屋根
                const roofGeo=new THREE.ConeGeometry(Math.max(w,d)*0.7,h*0.3,4);
                const roofMat=new THREE.MeshLambertMaterial({color:0x8b4513});
                const roof=new THREE.Mesh(roofGeo,roofMat);
                roof.position.set(x,groundH+h+h*0.15,z);
                roof.rotation.y=Math.PI/4;
                roof.castShadow=true;
                this.scene.add(roof);
                
                // 窓
                for(let j=0;j<2;j++){
                    const windowGeo=new THREE.BoxGeometry(0.1,1,1);
                    const windowMat=new THREE.MeshLambertMaterial({color:0x4169e1,emissive:0x1e3a8a,emissiveIntensity:0.2});
                    const window1=new THREE.Mesh(windowGeo,windowMat);
                    window1.position.set(x+w/2+0.05,groundH+h*0.6,z+j*d*0.5-d*0.25);
                    this.scene.add(window1);
                }
                
                this.buildings.push({
                    mesh:house,
                    bounds:{
                        minX:x-w/2,maxX:x+w/2,
                        minY:groundH,maxY:groundH+h,
                        minZ:z-d/2,maxZ:z+d/2
                    }
                });
            }
        }
        spawnObstacles(){
            // 木
            for(let i=0;i<40;i++){
                const x=(Math.random()-0.5)*this.settings.mapSize*0.7;
                const z=(Math.random()-0.5)*this.settings.mapSize*0.7;
                const groundH=this.getTerrainHeight(x,z);
                
                const trunkGeo=new THREE.CylinderGeometry(0.3,0.4,4,8);
                const trunkMat=new THREE.MeshLambertMaterial({color:0x654321});
                const trunk=new THREE.Mesh(trunkGeo,trunkMat);
                trunk.position.set(x,groundH+2,z);
                trunk.castShadow=true;
                this.scene.add(trunk);
                
                const leavesGeo=new THREE.SphereGeometry(2,8,8);
                const leavesMat=new THREE.MeshLambertMaterial({color:0x228b22});
                const leaves=new THREE.Mesh(leavesGeo,leavesMat);
                leaves.position.set(x,groundH+5,z);
                leaves.castShadow=true;
                this.scene.add(leaves);
                
                this.obstacles.push({
                    mesh:trunk,
                    bounds:{
                        minX:x-0.4,maxX:x+0.4,
                        minY:groundH,maxY:groundH+4,
                        minZ:z-0.4,maxZ:z+0.4
                    }
                });
            }
            
            // 岩
            for(let i=0;i<30;i++){
                const x=(Math.random()-0.5)*this.settings.mapSize*0.7;
                const z=(Math.random()-0.5)*this.settings.mapSize*0.7;
                const groundH=this.getTerrainHeight(x,z);
                const size=0.8+Math.random()*1.2;
                
                const rockGeo=new THREE.DodecahedronGeometry(size,0);
                const rockMat=new THREE.MeshLambertMaterial({color:0x696969});
                const rock=new THREE.Mesh(rockGeo,rockMat);
                rock.position.set(x,groundH+size*0.7,z);
                rock.rotation.set(Math.random(),Math.random(),Math.random());
                rock.castShadow=true;
                rock.receiveShadow=true;
                this.scene.add(rock);
                
                this.obstacles.push({
                    mesh:rock,
                    bounds:{
                        minX:x-size,maxX:x+size,
                        minY:groundH,maxY:groundH+size*1.5,
                        minZ:z-size,maxZ:z+size
                    }
                });
            }
        }
        spawnChests(){
            for(let i=0;i<25;i++){
                const x=(Math.random()-0.5)*this.settings.mapSize*0.7;
                const z=(Math.random()-0.5)*this.settings.mapSize*0.7;
                const groundH=this.getTerrainHeight(x,z);
                
                const geo=new THREE.BoxGeometry(1,0.8,1);
                const mat=new THREE.MeshLambertMaterial({color:0xffd700,emissive:0xffaa00,emissiveIntensity:0.3});
                const mesh=new THREE.Mesh(geo,mat);
                mesh.position.set(x,groundH+0.4,z);
                mesh.castShadow=true;
                this.scene.add(mesh);
                
                this.chests.push({mesh,pos:new THREE.Vector3(x,groundH+0.4,z),opened:false});
            }
        }
        spawnEnemies(){
            for(let i=0;i<this.settings.enemyCount;i++){
                const x=(Math.random()-0.5)*this.settings.mapSize*0.7;
                const z=(Math.random()-0.5)*this.settings.mapSize*0.7;
                const groundH=this.getTerrainHeight(x,z);
                
                const geo=new THREE.BoxGeometry(0.8,1.8,0.8);
                const mat=new THREE.MeshLambertMaterial({color:0xff3366});
                const mesh=new THREE.Mesh(geo,mat);
                mesh.position.set(x,groundH+0.9,z);
                mesh.castShadow=true;
                this.scene.add(mesh);
                
                const weapon=Object.keys(WEAPONS)[Math.floor(Math.random()*Object.keys(WEAPONS).length)];
                this.enemies.push({
                    id:i,mesh,
                    pos:new THREE.Vector3(x,groundH+0.9,z),
                    vel:new THREE.Vector3(),
                    rot:Math.random()*Math.PI*2,
                    hp:100,alive:true,
                    weapon,
                    lastShot:0,
                    target:null,
                    state:'idle',
                    height:1.8
                });
            }
        }
        setupControls(){
            const jArea=document.getElementById('joystick-area');
            const stick=document.getElementById('joystick-stick');
            let jActive=false,jId=null;
            
            jArea.addEventListener('touchstart',e=>{
                e.preventDefault();
                jActive=true;
                jId=e.changedTouches[0].identifier;
            });
            
            document.addEventListener('touchmove',e=>{
                if(!jActive)return;
                for(let t of e.changedTouches){
                    if(t.identifier===jId){
                        const rect=jArea.getBoundingClientRect();
                        const cx=rect.left+rect.width/2,cy=rect.top+rect.height/2;
                        const dx=t.clientX-cx,dy=t.clientY-cy;
                        const dist=Math.min(Math.hypot(dx,dy),rect.width/2.5);
                        const angle=Math.atan2(dx,dy);
                        this.input.mx=Math.sin(angle)*(dist/(rect.width/2.5));
                        this.input.my=Math.cos(angle)*(dist/(rect.width/2.5));
                        stick.style.transform=`translate(${dx/rect.width*45*2.5}px,${dy/rect.width*45*2.5}px)`;
                        break;
                    }
                }
            });
            
            document.addEventListener('touchend',e=>{
                for(let t of e.changedTouches){
                    if(t.identifier===jId){
                        jActive=false;
                        this.input.mx=0;
                        this.input.my=0;
                        stick.style.transform='';
                        break;
                    }
                }
            });
            
            const camArea=document.getElementById('camera-area');
            let camActive=false,camId=null,lastCamX=0,lastCamY=0;
            
            camArea.addEventListener('touchstart',e=>{
                e.preventDefault();
                if(e.changedTouches.length>0){
                    camActive=true;
                    camId=e.changedTouches[0].identifier;
                    lastCamX=e.changedTouches[0].clientX;
                    lastCamY=e.changedTouches[0].clientY;
                }
            });
            
            document.addEventListener('touchmove',e=>{
                if(!camActive)return;
                for(let t of e.changedTouches){
                    if(t.identifier===camId){
                        const dx=t.clientX-lastCamX;
                        const dy=t.clientY-lastCamY;
                        
                        this.player.rot-=dx*0.005;
                        this.player.pitch=Math.max(-0.8,Math.min(0.8,this.player.pitch-dy*0.003));
                        
                        lastCamX=t.clientX;
                        lastCamY=t.clientY;
                        break;
                    }
                }
            });
            
            document.addEventListener('touchend',e=>{
                for(let t of e.changedTouches){
                    if(t.identifier===camId){
                        camActive=false;
                        break;
                    }
                }
            });
            
            document.getElementById('fire-btn').addEventListener('touchstart',e=>{e.preventDefault();this.input.fire=true;});
            document.getElementById('fire-btn').addEventListener('touchend',e=>{e.preventDefault();this.input.fire=false;});
            
            document.getElementById('aim-btn').addEventListener('touchstart',e=>{e.preventDefault();this.player.aim=!this.player.aim;});
            
            document.getElementById('jump-btn').addEventListener('touchstart',e=>{
                e.preventDefault();
                if(this.player.ground){
                    this.player.vel.y=10;
                    this.player.ground=false;
                }
            });
            
            document.getElementById('reload-btn').addEventListener('touchstart',e=>{
                e.preventDefault();
                const w=this.player.inv[this.player.slot];
                if(w&&w.type==='weapon'){
                    this.player.reload=true;
                    this.player.reloadEnd=Date.now()+w.item.reload*1000;
                }
            });
            
            document.getElementById('build-btn').addEventListener('touchstart',e=>{
                e.preventDefault();
                this.player.building=!this.player.building;
                document.getElementById('build-menu').style.display=this.player.building?'flex':'none';
            });
            
            window.selectSlot=i=>{
                this.player.slot=i;
                this.updateUI();
            };
            
            window.addEventListener('resize',()=>{
                this.camera.aspect=window.innerWidth/window.innerHeight;
                this.camera.updateProjectionMatrix();
                this.renderer.setSize(window.innerWidth,window.innerHeight);
            });
        }
        updateUI(){
            document.getElementById('health-bar').style.width=`${this.player.hp}%`;
            document.getElementById('health-text').textContent=Math.floor(this.player.hp);
            document.getElementById('shield-bar').style.width=`${this.player.shield}%`;
            document.getElementById('shield-text').textContent=Math.floor(this.player.shield);
            document.getElementById('kill-count').textContent=this.player.kills;
            document.getElementById('alive-count').textContent=this.alive;
            
            const inv=document.getElementById('inventory-bar');
            inv.innerHTML='';
            for(let i=0;i<5;i++){
                const slot=document.createElement('div');
                slot.className=`inventory-slot ${i===this.player.slot?'selected':''} ${!this.player.inv[i]?'empty':''}`;
                slot.onclick=()=>selectSlot(i);
                
                if(this.player.inv[i]){
                    const item=this.player.inv[i];
                    const icon=document.createElement('div');
                    icon.className='slot-icon';
                    if(item.type==='weapon')icon.textContent='🔫';
                    else if(item.type==='heal')icon.textContent='💊';
                    slot.appendChild(icon);
                    
                    if(item.type==='weapon'){
                        const ammo=document.createElement('div');
                        ammo.className='slot-ammo';
                        ammo.textContent=`${this.player.mag[i]||0}/${this.player.ammo[item.item.ammo]||0}`;
                        slot.appendChild(ammo);
                        
                        const rarity=document.createElement('div');
                        rarity.className=`slot-rarity rarity-${item.item.rarity}`;
                        slot.appendChild(rarity);
                    }
                }
                inv.appendChild(slot);
            }
            
            const ammoDisp=document.getElementById('ammo-display');
            ammoDisp.innerHTML='';
            for(const[type,amt]of Object.entries(this.player.ammo)){
                const div=document.createElement('div');
                div.className='ammo-type';
                div.textContent=`${AMMO[type].icon}${amt}`;
                ammoDisp.appendChild(div);
            }
        }
        fire(){
            const weapon=this.player.inv[this.player.slot];
            if(!weapon||weapon.type!=='weapon')return;
            const w=weapon.item;
            if(this.player.reload)return;
            if(!this.player.mag[this.player.slot])this.player.mag[this.player.slot]=w.mag;
            if(this.player.mag[this.player.slot]<=0)return;
            if(Date.now()-this.player.lastShot<w.fireRate*1000)return;
            
            this.player.lastShot=Date.now();
            this.player.mag[this.player.slot]--;
            this.updateUI();
            
            const spread=this.player.aim?w.spread*0.3:w.spread;
            const dir=new THREE.Vector3(
                Math.sin(this.player.rot)+(Math.random()-0.5)*spread,
                this.player.pitch+(Math.random()-0.5)*spread*0.5,
                Math.cos(this.player.rot)+(Math.random()-0.5)*spread
            ).normalize();
            
            const shots=w.name==='ショットガン'?8:1;
            for(let i=0;i<shots;i++){
                const spreadDir=dir.clone();
                if(shots>1){
                    spreadDir.x+=(Math.random()-0.5)*w.spread;
                    spreadDir.y+=(Math.random()-0.5)*w.spread*0.5;
                    spreadDir.z+=(Math.random()-0.5)*w.spread;
                    spreadDir.normalize();
                }
                
                this.bullets.push({
                    pos:this.player.pos.clone().add(new THREE.Vector3(0,1.5,0)),
                    vel:spreadDir.multiplyScalar(200),
                    damage:w.damage,
                    range:w.range,
                    traveled:0,
                    owner:'player'
                });
            }
        }
        checkReload(){
            if(this.player.reload&&Date.now()>=this.player.reloadEnd){
                const w=this.player.inv[this.player.slot];
                if(w&&w.type==='weapon'){
                    const needed=w.item.mag-this.player.mag[this.player.slot];
                    const avail=this.player.ammo[w.item.ammo];
                    const refill=Math.min(needed,avail);
                    this.player.mag[this.player.slot]+=refill;
                    this.player.ammo[w.item.ammo]-=refill;
                }
                this.player.reload=false;
                this.updateUI();
            }
        }
        build(){
            const mat=this.player.buildType==='wall'?'wood':'stone';
            const cost=10;
            if(this.player.mats[mat]<cost)return;
            if(Date.now()-this.player.lastBuild<500)return;
            
            this.player.lastBuild=Date.now();
            this.player.mats[mat]-=cost;
            
            const dist=3;
            const x=this.player.pos.x+Math.sin(this.player.rot)*dist;
            const z=this.player.pos.z+Math.cos(this.player.rot)*dist;
            const groundH=this.getTerrainHeight(x,z);
            
            const geo=new THREE.BoxGeometry(3,3,0.3);
            const matObj=new THREE.MeshLambertMaterial({color:mat==='wood'?0x8b4513:0x808080});
            const mesh=new THREE.Mesh(geo,matObj);
            mesh.position.set(x,groundH+1.5,z);
            mesh.rotation.y=this.player.rot;
            mesh.castShadow=true;
            this.scene.add(mesh);
            
            this.structures.push({
                mesh,hp:mat==='wood'?200:400,
                bounds:{
                    minX:x-1.5,maxX:x+1.5,
                    minY:groundH,maxY:groundH+3,
                    minZ:z-0.15,maxZ:z+0.15
                }
            });
        }
        openChest(chest){
            chest.opened=true;
            this.scene.remove(chest.mesh);
            
            const items=2+Math.floor(Math.random()*3);
            for(let i=0;i<items;i++){
                const roll=Math.random();
                let item;
                if(roll<0.4){
                    const wKey=Object.keys(WEAPONS)[Math.floor(Math.random()*Object.keys(WEAPONS).length)];
                    item={type:'weapon',item:WEAPONS[wKey]};
                }else if(roll<0.6){
                    const hKey=Object.keys(HEALING)[Math.floor(Math.random()*Object.keys(HEALING).length)];
                    item={type:'heal',item:hKey};
                }else if(roll<0.8){
                    const aKey=Object.keys(AMMO)[Math.floor(Math.random()*Object.keys(AMMO).length)];
                    item={type:'ammo',ammoType:aKey,amt:20+Math.floor(Math.random()*30)};
                }else{
                    item={type:'mat',mat:MATS[Math.floor(Math.random()*3)],amt:20+Math.floor(Math.random()*40)};
                }
                this.spawnLoot(chest.pos.clone().add(new THREE.Vector3((Math.random()-0.5)*2,0.5,(Math.random()-0.5)*2)),item);
            }
        }
        spawnLoot(pos,item){
            const geo=new THREE.BoxGeometry(0.5,0.5,0.5);
            let color=0xffffff;
            if(item.type==='weapon')color=0x4169e1;
            else if(item.type==='heal')color=0x00ff00;
            else if(item.type==='ammo')color=0xffa500;
            else if(item.type==='mat')color=0x8b4513;
            
            const mat=new THREE.MeshLambertMaterial({color});
            const mesh=new THREE.Mesh(geo,mat);
            mesh.position.copy(pos);
            this.scene.add(mesh);
            
            const loot={...item,pos,mesh};
            this.loot.push(loot);
        }
        pickup(item){
            if(item.type==='weapon'){
                for(let i=0;i<5;i++){
                    if(!this.player.inv[i]){
                        this.player.inv[i]=item;
                        this.player.mag[i]=item.item.mag;
                        break;
                    }
                }
            }else if(item.type==='heal'){
                for(let i=0;i<5;i++){
                    if(!this.player.inv[i]){
                        this.player.inv[i]=item;
                        break;
                    }
                }
            }else if(item.type==='ammo'){
                this.player.ammo[item.ammoType]+=item.amt;
            }else if(item.type==='mat'){
                this.player.mats[item.mat]+=item.amt;
            }
            
            this.scene.remove(item.mesh);
            this.loot=this.loot.filter(l=>l!==item);
            this.updateUI();
            document.getElementById('pickup-notification').style.display='none';
        }
        playerDmg(amt){
            if(this.player.shield>0){
                this.player.shield=Math.max(0,this.player.shield-amt);
            }else{
                this.player.hp=Math.max(0,this.player.hp-amt);
            }
            this.updateUI();
            if(this.player.hp<=0)this.gameOver(false);
        }
        addKill(killer,victim){
            if(killer==='player')this.player.kills++;
            const feed=document.getElementById('kill-feed');
            const item=document.createElement('div');
            item.className='kill-item';
            item.innerHTML=`<span class="kill-killer">${killer}</span> → <span class="kill-victim">${victim}</span>`;
            feed.appendChild(item);
            setTimeout(()=>item.remove(),5000);
        }
        updateEnemies(dt){
            this.enemies.forEach(e=>{
                if(!e.alive)return;
                
                const toDist=e.pos.distanceTo(this.player.pos);
                if(toDist<80&&Math.random()<0.3*dt){
                    e.state='combat';
                    e.target=this.player.pos.clone();
                }else if(Math.random()<0.1*dt){
                    e.state='moving';
                    e.target=new THREE.Vector3(
                        (Math.random()-0.5)*this.settings.mapSize*0.5,
                        0,
                        (Math.random()-0.5)*this.settings.mapSize*0.5
                    );
                }
                
                if(e.state==='moving'&&e.target){
                    const dx=e.target.x-e.pos.x,dz=e.target.z-e.pos.z;
                    const dist=Math.hypot(dx,dz);
                    if(dist>1){
                        e.rot=Math.atan2(dx,dz);
                        const spd=3*dt;
                        const nx=e.pos.x+Math.sin(e.rot)*spd;
                        const nz=e.pos.z+Math.cos(e.rot)*spd;
                        
                        let canMove=true;
                        const test=new THREE.Vector3(nx,e.pos.y,nz);
                        for(const b of this.buildings){
                            if(this.collide(test,b.bounds)){canMove=false;break;}
                        }
                        for(const o of this.obstacles){
                            if(this.collide(test,o.bounds)){canMove=false;break;}
                        }
                        if(canMove){
                            e.pos.x=nx;
                            e.pos.z=nz;
                        }
                    }
                }
                
                if(e.state==='combat'&&toDist<100){
                    const dx=this.player.pos.x-e.pos.x,dz=this.player.pos.z-e.pos.z;
                    e.rot=Math.atan2(dx,dz);
                    
                    if(Date.now()-e.lastShot>WEAPONS[e.weapon].fireRate*1000&&Math.random()<0.5*dt){
                        e.lastShot=Date.now();
                        const dir=new THREE.Vector3(dx,this.player.pos.y-e.pos.y,dz).normalize();
                        this.bullets.push({
                            pos:e.pos.clone().add(new THREE.Vector3(0,1,0)),
                            vel:dir.multiplyScalar(150),
                            damage:WEAPONS[e.weapon].damage,
                            range:WEAPONS[e.weapon].range,
                            traveled:0,
                            owner:e
                        });
                    }
                }
                
                e.vel.y-=25*dt;
                e.pos.y+=e.vel.y*dt;
                const groundH=this.getTerrainHeight(e.pos.x,e.pos.z);
                if(e.pos.y<groundH+e.height/2){
                    e.pos.y=groundH+e.height/2;
                    e.vel.y=0;
                }
                
                e.mesh.position.copy(e.pos);
                e.mesh.rotation.y=e.rot;
            });
        }
        updateBullets(dt){
            this.bullets=this.bullets.filter(b=>{
                b.pos.add(b.vel.clone().multiplyScalar(dt));
                b.traveled+=b.vel.length()*dt;
                
                if(b.traveled>b.range)return false;
                
                const groundH=this.getTerrainHeight(b.pos.x,b.pos.z);
                if(b.pos.y<groundH)return false;
                
                if(b.owner==='player'){
                    for(const e of this.enemies){
                        if(!e.alive)continue;
                        if(b.pos.distanceTo(e.pos)<1){
                            e.hp-=b.damage;
                            this.player.dmgDealt+=b.damage;
                            if(e.hp<=0){
                                e.alive=false;
                                this.scene.remove(e.mesh);
                                this.alive--;
                                this.addKill('player',`Bot_${e.id}`);
                                this.updateUI();
                                if(this.alive<=1)this.gameOver(true);
                            }
                            return false;
                        }
                    }
                }else{
                    if(b.pos.distanceTo(this.player.pos)<1){
                        this.playerDmg(b.damage);
                        return false;
                    }
                }
                return true;
            });
        }
        updateStorm(dt){
            this.storm.nextTime-=dt;
            if(this.storm.nextTime<=0){
                this.storm.phase++;
                const phases=[
                    {target:this.settings.mapSize*0.6,time:180,dmg:2},
                    {target:this.settings.mapSize*0.4,time:120,dmg:5},
                    {target:this.settings.mapSize*0.2,time:90,dmg:10},
                    {target:50,time:60,dmg:20}
                ];
                if(this.storm.phase<phases.length){
                    const p=phases[this.storm.phase];
                    this.storm.target=p.target;
                    this.storm.nextTime=p.time/(this.settings.stormSpeed||1);
                    this.storm.dmg=p.dmg;
                    this.storm.speed=(this.storm.radius-this.storm.target)/this.storm.nextTime;
                }
            }
            
            if(this.storm.radius>this.storm.target){
                this.storm.radius=Math.max(this.storm.target,this.storm.radius-this.storm.speed*dt);
            }
            
            if(this.stormDist(this.player.pos)<0){
                this.playerDmg(this.storm.dmg*dt);
            }
            
            this.enemies.forEach(e=>{
                if(!e.alive)return;
                if(this.stormDist(e.pos)<0){
                    e.hp-=this.storm.dmg*dt;
                    if(e.hp<=0){
                        e.alive=false;
                        this.scene.remove(e.mesh);
                        this.alive--;
                        this.addKill('STORM',`Bot_${e.id}`);
                        this.updateUI();
                    }
                }
            });
            
            const m=Math.floor(this.storm.nextTime/60);
            const s=Math.floor(this.storm.nextTime%60);
            document.getElementById('storm-timer').textContent=`⛈️ ${m}:${s.toString().padStart(2,'0')}`;
        }
        stormDist(pos){
            return this.storm.radius-Math.hypot(pos.x-this.storm.cx,pos.z-this.storm.cz);
        }
        collide(pos,b){
            return pos.x>=b.minX&&pos.x<=b.maxX&&
                   pos.z>=b.minZ&&pos.z<=b.maxZ&&
                   pos.y>=b.minY&&pos.y<=b.maxY;
        }
        updatePlayer(dt){
            const spd=7;
            const mx=this.input.mx*spd*dt;
            const mz=this.input.my*spd*dt;
            
            const sin=Math.sin(this.player.rot);
            const cos=Math.cos(this.player.rot);
            
            const nx=this.player.pos.x+(mx*cos-mz*sin);
            const nz=this.player.pos.z+(mx*sin+mz*cos);
            
            let canMove=true;
            const testPos=new THREE.Vector3(nx,this.player.pos.y,nz);
            for(const b of this.buildings){
                if(this.collide(testPos,b.bounds)){
                    canMove=false;
                    break;
                }
            }
            if(canMove){
                for(const o of this.obstacles){
                    if(this.collide(testPos,o.bounds)){
                        canMove=false;
                        break;
                    }
                }
            }
            
            if(canMove){
                this.player.pos.x=nx;
                this.player.pos.z=nz;
            }
            
            this.player.vel.y-=25*dt;
            this.player.pos.y+=this.player.vel.y*dt;
            
            const groundH=this.getTerrainHeight(this.player.pos.x,this.player.pos.z);
            const playerBottom=groundH+this.player.height/2;
            
            if(this.player.pos.y<playerBottom){
                this.player.pos.y=playerBottom;
                this.player.vel.y=0;
                this.player.ground=true;
            }else{
                this.player.ground=false;
            }
            
            this.playerMesh.position.copy(this.player.pos);
            this.playerMesh.rotation.y=this.player.rot;
            
            const camDist=this.player.aim?2:4.5;
            const camHeight=this.player.aim?1.3:2.8;
            
            this.camera.position.set(
                this.player.pos.x-sin*camDist,
                this.player.pos.y+camHeight,
                this.player.pos.z-cos*camDist
            );
            
            this.camera.lookAt(
                this.player.pos.x+sin*10,
                this.player.pos.y+1.5+this.player.pitch*5,
                this.player.pos.z+cos*10
            );
            
            if(this.input.fire){
                if(this.player.building)this.build();
                else this.fire();
            }
            
            this.checkReload();
        }
        updateMinimap(){
            const ctx=this.mmCtx;
            const sz=110;
            const sc=sz/(this.settings.mapSize*0.25);
            
            ctx.clearRect(0,0,sz,sz);
            ctx.fillStyle='rgba(0,0,0,0.7)';
            ctx.fillRect(0,0,sz,sz);
            
            ctx.beginPath();
            ctx.arc(
                sz/2+(this.storm.cx-this.player.pos.x)*sc,
                sz/2+(this.storm.cz-this.player.pos.z)*sc,
                this.storm.radius*sc,
                0,Math.PI*2
            );
            ctx.strokeStyle='rgba(150,50,255,0.8)';
            ctx.lineWidth=2;
            ctx.stroke();
            
            ctx.beginPath();
            ctx.arc(
                sz/2+(this.storm.cx-this.player.pos.x)*sc,
                sz/2+(this.storm.cz-this.player.pos.z)*sc,
                this.storm.target*sc,
                0,Math.PI*2
            );
            ctx.fillStyle='rgba(255,255,255,0.1)';
            ctx.fill();
            
            ctx.fillStyle='rgba(255,50,50,0.7)';
            this.enemies.forEach(e=>{
                if(!e.alive)return;
                const dx=e.pos.x-this.player.pos.x;
                const dz=e.pos.z-this.player.pos.z;
                if(Math.abs(dx)<80&&Math.abs(dz)<80){
                    ctx.beginPath();
                    ctx.arc(sz/2+dx*sc,sz/2+dz*sc,2,0,Math.PI*2);
                    ctx.fill();
                }
            });
            
            ctx.fillStyle='rgba(255,215,0,0.8)';
            this.chests.forEach(c=>{
                if(c.opened)return;
                const dx=c.pos.x-this.player.pos.x;
                const dz=c.pos.z-this.player.pos.z;
                if(Math.abs(dx)<80&&Math.abs(dz)<80){
                    ctx.fillRect(sz/2+dx*sc-2,sz/2+dz*sc-2,4,4);
                }
            });
            
            ctx.fillStyle='#00f5ff';
            ctx.beginPath();
            ctx.arc(sz/2,sz/2,4,0,Math.PI*2);
            ctx.fill();
            
            ctx.strokeStyle='#00f5ff';
            ctx.lineWidth=2;
            ctx.beginPath();
            ctx.moveTo(sz/2,sz/2);
            ctx.lineTo(
                sz/2+Math.sin(this.player.rot)*12,
                sz/2+Math.cos(this.player.rot)*12
            );
            ctx.stroke();
        }
        checkNearby(){
            const range=2.5;
            let near=null;
            let minD=Infinity;
            
            this.chests.forEach(c=>{
                if(c.opened)return;
                const d=c.pos.distanceTo(this.player.pos);
                if(d<range&&d<minD){
                    minD=d;
                    near={type:'chest',chest:c};
                }
            });
            
            this.loot.forEach(l=>{
                const d=l.pos.distanceTo(this.player.pos);
                if(d<range&&d<minD){
                    minD=d;
                    near=l;
                }
            });
            
            const notif=document.getElementById('pickup-notification');
            if(near){
                let name='',desc='';
                if(near.type==='chest'){
                    name='宝箱';
                    desc='タップで開ける';
                    document.getElementById('pickup-btn').textContent='開ける';
                    document.getElementById('pickup-btn').onclick=()=>{
                        this.openChest(near.chest);
                        notif.style.display='none';
                    };
                }else{
                    if(near.type==='weapon'){
                        name=near.item.name;
                        desc=`${near.item.rarity} DMG:${near.item.damage}`;
                    }else if(near.type==='heal'){
                        name=HEALING[near.item]?.name||near.item;
                        desc=`回復:${HEALING[near.item]?.heal||0}`;
                    }else if(near.type==='ammo'){
                        name=AMMO[near.ammoType]?.name||near.ammoType;
                        desc=`x${near.amt}`;
                    }else if(near.type==='mat'){
                        name=near.mat;
                        desc=`x${near.amt}`;
                    }
                    document.getElementById('pickup-btn').textContent='拾う';
                    document.getElementById('pickup-btn').onclick=()=>this.pickup(near);
                }
                document.getElementById('pickup-name').textContent=name;
                document.getElementById('pickup-desc').textContent=desc;
                notif.style.display='flex';
                this.nearItem=near;
            }else{
                notif.style.display='none';
                this.nearItem=null;
            }
        }
        loop(){
            if(this.state!=='playing')return;
            
            const dt=Math.min(this.clock.getDelta(),0.1);
            
            this.updatePlayer(dt);
            this.updateEnemies(dt);
            this.updateBullets(dt);
            this.updateStorm(dt);
            this.updateMinimap();
            this.checkNearby();
            
            this.loot.forEach(l=>{
                if(l.mesh){
                    l.mesh.rotation.y+=dt*2;
                    l.mesh.position.y=l.pos.y+0.4+Math.sin(Date.now()*0.003)*0.15;
                }
            });
            
            this.renderer.render(this.scene,this.camera);
            requestAnimationFrame(()=>this.loop());
        }
        gameOver(win){
            this.state='gameover';
            const t=Math.floor((Date.now()-this.startTime)/1000);
            const m=Math.floor(t/60);
            const s=t%60;
            
            document.getElementById('gameover-title').textContent=win?'VICTORY ROYALE':'ELIMINATED';
            document.getElementById('gameover-title').className=`gameover-title ${win?'victory':'defeat'}`;
            document.getElementById('final-rank').textContent=`#${this.alive}`;
            document.getElementById('final-kills').textContent=this.player.kills;
            document.getElementById('final-damage').textContent=Math.floor(this.player.dmgDealt);
            document.getElementById('final-time').textContent=`${m}:${s.toString().padStart(2,'0')}`;
            document.getElementById('gameover-screen').style.display='flex';
        }
        reset(){
            if(this.scene){
                while(this.scene.children.length){
                    this.scene.remove(this.scene.children[0]);
                }
            }
            
            this.settings={mapSize:500,enemyCount:99};
            
            document.getElementById('game-container').style.display='none';
            document.getElementById('hud').style.display='none';
            document.getElementById('controls').style.display='none';
            document.getElementById('crosshair').style.display='none';
            document.getElementById('build-menu').style.display='none';
            document.getElementById('gameover-screen').style.display='none';
        }
    }
    
    const game=new Game();
