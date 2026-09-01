// app.js - High-Accuracy Variable Displacement AC Compressor & ECV Simulation

// -------------------------------------------------------------
// 1. GLOBAL STATE & CONFIGURATION
// -------------------------------------------------------------
const state = {
  mode: 'state1', // 'state1', 'state2', 'pwm', 'autocycle'
  pwmDuty: 0, // 0% (State 1: Open) to 100% (State 2: Closed)
  rpm: 1800, // Compressor RPM (600 - 4000)
  cabinTemp: 24.0, // °C
  
  // Mechanical Kinematics
  shaftAngle: 0, // Radians (0 to 2*PI)
  swashAngle: 4.8, // Current swashplate tilt angle in degrees (2° - 22°)
  targetSwashAngle: 4.8,
  pistonStroke: 5.2, // mm (current stroke)
  
  // Telemetry & Pressures (bar)
  pressureCrankcase: 12.4, // Pc
  pressureSuction: 2.1, // Ps
  pressureDischarge: 14.8, // Pd
  displacement: 8.5, // cc/rev (max ~160 cc/rev)
  coolingPower: 0.4, // kW
  fuelDraw: 0.15, // L/hr
  
  // In-Cylinder Pressures for Top & Bottom Piston
  pCylTop: 2.1,
  pCylBot: 14.8,
  
  // Animation & Viewport
  simSpeed: 1.0,
  isPaused: false,
  activeFault: null,
  inspectedPart: 'ecv-valve',
  
  // Audio Narration & Synth
  voicePlaying: false,
  currentAudioStep: 0,
  speechSynth: window.speechSynthesis || null,
  activeUtterance: null,
  soundFxEnabled: false,
  audioCtx: null,
  motorOsc: null,
  motorGain: null,
  pwmOsc: null,
  pwmGain: null,
  
  // Quiz
  quizIndex: 0,
  quizScore: 0,
  quizSelectedOpt: null,
};

// -------------------------------------------------------------
// 2. AUDIO NARRATION SCRIPTS (Multi-Stage Educational Tour)
// -------------------------------------------------------------
const narrationSteps = [
  {
    step: 1,
    title: 'State 1: Electronic Control Valve Open (Minimum Displacement)',
    text: 'In State 1, the Electronic Control Valve Solenoid is de-energized and open. High-pressure discharge gas bleeds directly into the crankcase cavity. This elevated crankcase pressure acts on the backside of the pistons, overcoming cylinder pressure and forcing the swashplate against its return spring into a nearly upright angle of only 2 to 5 degrees. The pistons make very short strokes, reducing displacement to about 5%, which prevents evaporator freeze-up and saves vehicle fuel.',
    setup: () => setOperatingMode('state1')
  },
  {
    step: 2,
    title: 'State 2: Electronic Control Valve Closed (Maximum Displacement)',
    text: 'In State 2, the vehicle climate control computer commands maximum cooling by energizing the solenoid to close the valve needle. With the high-pressure discharge port sealed off, crankcase gas bleeds down to the low-pressure suction line. The reduced pressure behind the pistons allows the spring and cylinder forces to tilt the swashplate to its maximum angle of 20 to 22 degrees. The pistons execute full-depth strokes, delivering 100% volumetric displacement for rapid cabin cooling.',
    setup: () => setOperatingMode('state2')
  },
  {
    step: 3,
    title: 'Dynamic Pulse Width Modulation (PWM) Control',
    text: 'Unlike traditional on-off magnetic clutches, modern variable displacement compressors remain continuously coupled to the engine belt. The climate computer pulses the control valve solenoid at 400 Hertz using Pulse Width Modulation between 0% and 100%. By modulating duty cycle, the ECU smoothly adjusts the crankcase pressure, infinitely tailoring compressor displacement to match the exact cabin cooling load.',
    setup: () => setOperatingMode('pwm')
  },
  {
    step: 4,
    title: 'Thermodynamic Pressure Balance (Pc vs Ps vs Pd)',
    text: 'Notice the three critical pressure chambers: Crankcase pressure P-c, Suction pressure P-s, and Discharge pressure P-d. The swashplate tilt angle is governed by the dynamic force equilibrium across the piston heads. When P-c rises toward P-d, the compressor destrokes. When P-c bleeds toward P-s, the compressor strokes up to full capacity.',
    setup: () => {}
  }
];

// -------------------------------------------------------------
// 3. COMPONENT METADATA DATABASE
// -------------------------------------------------------------
const partsData = {
  'ecv-valve': {
    title: 'Electronic Control Valve (ECV) Solenoid',
    type: 'PWM PROPORTIONAL SOLENOID',
    desc: 'Electromagnetic proportional valve modulated by the Climate ECU (typically 400 Hz PWM). Regulates refrigerant flow from the discharge line into the crankcase cavity to continuously adjust swashplate tilt angle.',
    val1: () => state.pwmDuty > 50 ? 'Valve Closed (Energized)' : 'Valve Open (De-energized)',
    val2: () => state.pwmDuty > 50 ? 'Crankcase → Suction Bleed' : 'Discharge → Crankcase Flow',
    actionLabel: 'Toggle 12V Solenoid Pulse',
    actionFn: () => {
      state.pwmDuty = state.pwmDuty > 50 ? 0 : 100;
      updateControlInputs();
      showNotification(`Solenoid PWM toggled to ${state.pwmDuty}%`, 'info');
    }
  },
  'swashplate': {
    title: 'Variable Swashplate (Wobble Plate)',
    type: 'KINEMATIC DRIVE MECHANISM',
    desc: 'Precision cast steel disc mounted on the drive shaft with a sliding pivot pin. Tilts between 2° (idle) and 22° (full stroke), converting rotational shaft torque into reciprocating axial piston movement.',
    val1: () => `Tilt Angle: ${state.swashAngle.toFixed(1)}°`,
    val2: () => `Piston Stroke: ${state.pistonStroke.toFixed(1)} mm`,
    actionLabel: 'Cycle Swashplate Pivot',
    actionFn: () => {
      state.targetSwashAngle = state.swashAngle > 10 ? 3.0 : 20.0;
      showNotification('Swashplate angle forced across pivot range.', 'info');
    }
  },
  'drive-shaft': {
    title: 'Compressor Drive Shaft & Return Spring',
    type: 'ROTARY INPUT ASSEMBLY',
    desc: 'Driven continuously by the engine serpentine belt via a rubber damper pulley (clutchless design). Features an internal return spring that urges the swashplate toward maximum tilt when crankcase pressure drops.',
    val1: () => `Shaft Speed: ${state.rpm.toLocaleString()} RPM`,
    val2: () => `Torque Load: ${(state.displacement * 0.08).toFixed(1)} Nm`,
    actionLabel: 'Boost Shaft RPM to 3,000',
    actionFn: () => {
      state.rpm = 3000;
      document.getElementById('slider-rpm').value = 3000;
      document.getElementById('label-rpm').textContent = '3,000 RPM';
      showNotification('Compressor Shaft Speed set to 3,000 RPM', 'info');
    }
  },
  'piston-top': {
    title: 'Upper Reciprocating Piston',
    type: 'DOUBLE-ACTING/SINGLE-ACTING PISTON',
    desc: 'PTFE-coated aluminum alloy piston with shoe slipper ball joint. Compresses suction refrigerant gas up to 15+ bar before discharging past the reed valve plate.',
    val1: () => `Top Cylinder: ${state.pCylTop.toFixed(1)} bar`,
    val2: () => `Axial Velocity: ${(Math.abs(Math.sin(state.shaftAngle)) * (state.rpm / 60) * 0.03).toFixed(2)} m/s`,
    actionLabel: 'Inspect Piston Slipper Shoes',
    actionFn: () => showNotification('Piston slipper shoes: Nominal clearance (0.015 mm).', 'success')
  },
  'piston-bottom': {
    title: 'Lower Reciprocating Piston',
    type: 'RECIPROCATING CYLINDER STAGE',
    desc: 'Operates 180° out of phase with the upper piston, providing continuous smooth gas compression and reduced torque ripple on the engine belt drive.',
    val1: () => `Bottom Cylinder: ${state.pCylBot.toFixed(1)} bar`,
    val2: () => `Phase Offset: 180° (Antiphase)`,
    actionLabel: 'Check Cylinder Bore Sealing',
    actionFn: () => showNotification('Cylinder bore sealing: 100% volumetric integrity.', 'success')
  },
  'suction-port': {
    title: 'Low-Pressure Suction Manifold (Ps)',
    type: 'REFRIGERANT INTAKE PORT',
    desc: 'Draws cold, low-pressure vaporized refrigerant gas from the vehicle evaporator at approximately 1.5 to 2.5 bar and 0°C to 5°C.',
    val1: () => `Pressure Ps: ${state.pressureSuction.toFixed(1)} bar`,
    val2: () => 'Inflow from Evaporator',
    actionLabel: 'Measure Evaporator Superheat',
    actionFn: () => showNotification('Evaporator Superheat: 5.4 K (Nominal)', 'info')
  },
  'discharge-port': {
    title: 'High-Pressure Discharge Manifold (Pd)',
    type: 'REFRIGERANT OUTLET PORT',
    desc: 'Delivers hot, high-pressure superheated refrigerant gas (12 to 18 bar at 70°C to 95°C) to the vehicle condenser coil for heat rejection.',
    val1: () => `Pressure Pd: ${state.pressureDischarge.toFixed(1)} bar`,
    val2: () => 'Outflow to Condenser',
    actionLabel: 'Check Condenser Subcooling',
    actionFn: () => showNotification('Condenser Subcooling: 4.8 K', 'info')
  }
};

// -------------------------------------------------------------
// 4. KNOWLEDGE MASTERY QUIZ QUESTIONS
// -------------------------------------------------------------
const quizQuestions = [
  {
    q: "In State 1, when the Electronic Control Valve is OPEN, why does compressor displacement drop to minimum?",
    options: [
      "The electrical motor shuts down completely",
      "High discharge pressure enters the crankcase, overcoming spring force and pushing the swashplate toward vertical (low tilt angle)",
      "Refrigerant leaks out of the vehicle condenser",
      "The piston shoes detach from the swashplate"
    ],
    correct: 1,
    explanation: "When the ECV opens, high-pressure discharge gas flows into the crankcase cavity. The elevated crankcase pressure pushes against the backside of the pistons, forcing the swashplate into an upright position (2°-5°), resulting in minimal piston stroke."
  },
  {
    q: "What happens to the crankcase pressure (Pc) in State 2 when the solenoid valve CLOSES?",
    options: [
      "Crankcase pressure rises to 30 bar",
      "Crankcase pressure bleeds down to suction pressure (Ps) through internal passages, allowing the swashplate to tilt to maximum angle",
      "Crankcase pressure freezes into solid ice",
      "Crankcase pressure vents into the passenger cabin"
    ],
    correct: 1,
    explanation: "When the ECV closes, discharge gas is blocked. The trapped crankcase gas bleeds through internal clearance into the low-pressure suction line, dropping Pc to near Ps. The drive spring and cylinder forces tilt the swashplate to its maximum angle (~20°)."
  },
  {
    q: "Why do modern variable displacement AC compressors use clutchless belt pulleys?",
    options: [
      "To eliminate the shock, noise, and wear of magnetic clutch engagement while seamlessly tailoring displacement to cooling demand",
      "Because clutches are illegal in automotive standards",
      "To increase engine fuel consumption",
      "To prevent the drive shaft from spinning"
    ],
    correct: 0,
    explanation: "Clutchless variable compressors remain continuously connected to the engine belt. By modulating the ECV valve from 0% to 100% PWM, cooling output is adjusted smoothly without sudden engine torque jerks or magnetic clutch wear."
  },
  {
    q: "What typical PWM frequency does the vehicle Climate ECU use to control the Electronic Control Valve?",
    options: [
      "50 kHz",
      "400 Hz - 500 Hz",
      "1 Hz (once per second)",
      "0.1 Hz"
    ],
    correct: 1,
    explanation: "Automotive climate control ECUs typically modulate the ECV solenoid at a frequency of 400 to 500 Hz to achieve smooth, responsive, and precise proportional pressure regulation without acoustic resonance."
  },
  {
    q: "If the Electronic Control Valve gets mechanically STUCK OPEN, what symptom will the driver experience?",
    options: [
      "The AC system will blow warm air / fail to cool because the compressor cannot stroke up from its 5% idle position",
      "The evaporator will freeze solid into a block of ice",
      "The engine belt will snap immediately",
      "The cabin heater will overheat"
    ],
    correct: 0,
    explanation: "A valve stuck open continuously pressurizes the crankcase with discharge gas, locking the swashplate at its minimum 2°-5° destroke angle. The compressor cannot pump sufficient refrigerant, leading to a loss of cabin cooling."
  }
];

// -------------------------------------------------------------
// 5. PARTICLE FLUID SIMULATION ENGINE (Canvas 2D - 1480x720)
// -------------------------------------------------------------
class ParticleFlowSimulation {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.initParticleStreams();
  }

  initParticleStreams() {
    this.particles = [];
    // Stream 1: Discharge gas to ECV (Red)
    for (let i = 0; i < 22; i++) {
      this.particles.push({
        type: 'discharge-to-ecv',
        color: '#ef4444',
        glow: 'rgba(239, 68, 68, 0.85)',
        t: Math.random(),
        speed: 0.008,
        size: 3.5,
        path: [{ x: 720, y: 440 }, { x: 720, y: 340 }, { x: 830, y: 340 }, { x: 830, y: 285 }]
      });
    }
    // Stream 2: Upper Crankcase Bleed Channel (Horizontal Blue Conduit)
    for (let i = 0; i < 28; i++) {
      this.particles.push({
        type: 'ecv-to-crankcase',
        color: '#38bdf8',
        glow: 'rgba(56, 189, 248, 0.85)',
        t: Math.random(),
        speed: 0.006,
        size: 3.8,
        path: [{ x: 780, y: 290 }, { x: 600, y: 290 }, { x: 400, y: 290 }, { x: 220, y: 290 }, { x: 140, y: 350 }]
      });
    }
    // Stream 3: Suction intake to Cylinders (Cyan)
    for (let i = 0; i < 24; i++) {
      this.particles.push({
        type: 'suction-flow',
        color: '#06b6d4',
        glow: 'rgba(6, 182, 212, 0.85)',
        t: Math.random(),
        speed: 0.009,
        size: 3.5,
        path: [{ x: 920, y: 552 }, { x: 780, y: 552 }, { x: 640, y: 552 }, { x: 540, y: 552 }]
      });
    }
    // Stream 4: Inset ECV Cutaway Flow (Right Panel)
    for (let i = 0; i < 16; i++) {
      this.particles.push({
        type: 'inset-ecv-flow',
        color: '#ffffff',
        glow: 'rgba(255, 255, 255, 0.9)',
        t: Math.random(),
        speed: 0.01,
        size: 4.0,
        path: [{ x: 1240, y: 515 }, { x: 1240, y: 410 }, { x: 1150, y: 365 }]
      });
    }
  }

  update(deltaTime) {
    if (state.isPaused) return;

    const rpmScale = state.rpm / 1800;
    const strokeScale = state.swashAngle / 20;

    this.particles.forEach(p => {
      let speedMult = state.simSpeed * rpmScale;

      if (p.type === 'discharge-to-ecv') {
        const openFactor = (100 - state.pwmDuty) / 100;
        speedMult *= (0.2 + 0.8 * openFactor);
        p.alpha = 0.3 + 0.7 * openFactor;
      } else if (p.type === 'ecv-to-crankcase') {
        if (state.pwmDuty > 70) {
          p.color = '#38bdf8';
          p.glow = 'rgba(56, 189, 248, 0.85)';
          speedMult *= 0.4;
        } else {
          p.color = '#f59e0b';
          p.glow = 'rgba(245, 158, 11, 0.85)';
          speedMult *= 1.2;
        }
      } else if (p.type === 'suction-flow') {
        speedMult *= (0.2 + 0.8 * strokeScale);
        p.alpha = 0.4 + 0.6 * strokeScale;
      } else if (p.type === 'inset-ecv-flow') {
        if (state.pwmDuty > 70) {
          p.path = [{ x: 1150, y: 365 }, { x: 1240, y: 365 }, { x: 1240, y: 310 }];
          p.color = '#38bdf8';
          p.glow = 'rgba(56, 189, 248, 0.85)';
          speedMult *= 0.5;
        } else {
          p.path = [{ x: 1240, y: 515 }, { x: 1240, y: 410 }, { x: 1150, y: 365 }];
          p.color = '#ffffff';
          p.glow = 'rgba(255, 255, 255, 0.9)';
          speedMult *= 1.1;
        }
      }

      p.t += p.speed * speedMult * (deltaTime * 60);
      if (p.t > 1.0) p.t = 0;
      if (p.t < 0) p.t = 1.0;
    });
  }

  draw() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.particles.forEach(p => {
      const pos = this.getPointOnPath(p.path, p.t);
      this.ctx.save();
      this.ctx.globalAlpha = p.alpha !== undefined ? p.alpha : 0.9;
      this.ctx.beginPath();
      this.ctx.arc(pos.x, pos.y, p.size, 0, Math.PI * 2);
      this.ctx.fillStyle = p.color;
      this.ctx.shadowColor = p.glow;
      this.ctx.shadowBlur = 8;
      this.ctx.fill();
      this.ctx.restore();
    });
  }

  getPointOnPath(path, t) {
    if (path.length === 1) return path[0];
    const totalSegments = path.length - 1;
    const scaledT = Math.max(0, Math.min(0.999, t)) * totalSegments;
    const segIdx = Math.floor(scaledT);
    const segT = scaledT - segIdx;
    const p1 = path[segIdx];
    const p2 = path[segIdx + 1];
    return {
      x: p1.x + (p2.x - p1.x) * segT,
      y: p1.y + (p2.y - p1.y) * segT
    };
  }
}

// -------------------------------------------------------------
// 6. LIVE PV INDICATOR DIAGRAM ENGINE (Pressure-Volume Cycle)
// -------------------------------------------------------------
class PvDiagramEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  draw() {
    if (!this.canvas || !this.ctx) return;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const ctx = this.ctx;

    ctx.clearRect(0, 0, w, h);

    // Coordinate mapping
    const padL = 36;
    const padR = 15;
    const padT = 15;
    const padB = 25;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    // Grid lines
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.4)';
    ctx.lineWidth = 1;

    for (let i = 0; i <= 4; i++) {
      const y = padT + (plotH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(w - padR, y);
      ctx.stroke();

      // Y-axis label (Pressure bar)
      const pVal = (18 - (18 / 4) * i).toFixed(0);
      ctx.fillStyle = '#64748b';
      ctx.font = '9px monospace';
      ctx.fillText(`${pVal}b`, 8, y + 3);
    }

    // X-axis label (Volume)
    ctx.fillStyle = '#64748b';
    ctx.font = '9px monospace';
    ctx.fillText('V_min', padL, h - 8);
    ctx.fillText('V_max', w - padR - 30, h - 8);

    // Calculate PV Cycle Loop
    // Points: 1 (Intake end/BDC), 2 (Compression end/P_d reached), 3 (Discharge end/TDC), 4 (Re-expansion/P_s reached)
    const strokeFrac = state.swashAngle / 22.0; // 0.1 to 1.0
    const vMin = padL + plotW * 0.15;
    const vMax = padL + plotW * (0.2 + 0.75 * strokeFrac);

    const yPs = padT + plotH * (1 - state.pressureSuction / 18);
    const yPd = padT + plotH * (1 - state.pressureDischarge / 18);

    // Draw Indicator PV Loop
    ctx.beginPath();
    ctx.strokeStyle = state.pwmDuty > 50 ? '#06b6d4' : '#f59e0b';
    ctx.lineWidth = 2.5;
    ctx.fillStyle = state.pwmDuty > 50 ? 'rgba(6, 182, 212, 0.15)' : 'rgba(245, 158, 11, 0.15)';

    // Suction line: 4 -> 1
    ctx.moveTo(vMin, yPs);
    ctx.lineTo(vMax, yPs);

    // Polytropic Compression line: 1 -> 2
    const numSteps = 16;
    for (let i = 0; i <= numSteps; i++) {
      const frac = i / numSteps;
      const vx = vMax - (vMax - (vMin + (vMax - vMin) * 0.25)) * frac;
      const vRatio = vMax / vx;
      const pComp = Math.min(state.pressureDischarge, state.pressureSuction * Math.pow(vRatio, 1.15));
      const py = padT + plotH * (1 - pComp / 18);
      ctx.lineTo(vx, py);
    }

    // Discharge line: 2 -> 3
    ctx.lineTo(vMin, yPd);

    // Re-expansion: 3 -> 4
    ctx.lineTo(vMin, yPs);

    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Draw Live Operating Point Marker (Current cylinder state)
    const theta = state.shaftAngle;
    const currentV = vMin + ((vMax - vMin) / 2) * (1 - Math.cos(theta));
    const currentP = state.pCylTop;
    const markerY = padT + plotH * (1 - currentP / 18);

    ctx.beginPath();
    ctx.arc(currentV, markerY, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#f43f5e';
    ctx.shadowColor = '#f43f5e';
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.restore();
  }
}

// -------------------------------------------------------------
// 7. PROCEDURAL WEB AUDIO SYNTHESIZER
// -------------------------------------------------------------
function initSoundEngine() {
  if (state.audioCtx) return;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    state.audioCtx = new AudioContext();

    state.masterGain = state.audioCtx.createGain();
    state.masterGain.gain.setValueAtTime(0.2, state.audioCtx.currentTime);
    state.masterGain.connect(state.audioCtx.destination);

    // 1. Motor & Shaft Rotation Rumble (60Hz scaled with RPM)
    state.motorOsc = state.audioCtx.createOscillator();
    state.motorOsc.type = 'sawtooth';
    state.motorOsc.frequency.setValueAtTime(60, state.audioCtx.currentTime);

    state.motorFilter = state.audioCtx.createBiquadFilter();
    state.motorFilter.type = 'lowpass';
    state.motorFilter.frequency.setValueAtTime(160, state.audioCtx.currentTime);

    state.motorGain = state.audioCtx.createGain();
    state.motorGain.gain.setValueAtTime(0.12, state.audioCtx.currentTime);

    state.motorOsc.connect(state.motorFilter);
    state.motorFilter.connect(state.motorGain);
    state.motorGain.connect(state.masterGain);
    state.motorOsc.start();

    // 2. Solenoid PWM Buzzing (400Hz)
    state.pwmOsc = state.audioCtx.createOscillator();
    state.pwmOsc.type = 'square';
    state.pwmOsc.frequency.setValueAtTime(400, state.audioCtx.currentTime);

    state.pwmGain = state.audioCtx.createGain();
    state.pwmGain.gain.setValueAtTime(0.0, state.audioCtx.currentTime);

    state.pwmOsc.connect(state.pwmGain);
    state.pwmGain.connect(state.masterGain);
    state.pwmOsc.start();

    state.soundFxEnabled = true;
    updateAudioSynthParams();
    updateSoundFxIcon();
    showNotification('Mechanical Sound Synthesizer Active.', 'info');
  } catch (err) {
    console.warn('Audio Context error:', err);
  }
}

function updateAudioSynthParams() {
  if (!state.audioCtx || !state.soundFxEnabled) return;
  const t = state.audioCtx.currentTime;
  const rpmRatio = state.rpm / 1800;
  
  if (state.isPaused) {
    state.motorGain.gain.setTargetAtTime(0, t, 0.1);
    state.pwmGain.gain.setTargetAtTime(0, t, 0.1);
    return;
  }

  // Pitch scales with shaft speed
  state.motorOsc.frequency.setTargetAtTime(45 + 40 * rpmRatio, t, 0.05);
  state.motorGain.gain.setTargetAtTime(0.15 * (0.5 + 0.5 * (state.swashAngle / 20)), t, 0.05);

  // PWM buzz volume proportional to duty cycle
  const pwmVolume = (state.pwmDuty / 100) * 0.04;
  state.pwmGain.gain.setTargetAtTime(pwmVolume, t, 0.05);
}

function toggleSoundFx() {
  if (!state.audioCtx) {
    initSoundEngine();
    return;
  }
  state.soundFxEnabled = !state.soundFxEnabled;
  if (state.soundFxEnabled) {
    state.masterGain.gain.setTargetAtTime(0.2, state.audioCtx.currentTime, 0.05);
    updateAudioSynthParams();
    showNotification('Sound Effects Enabled', 'info');
  } else {
    state.masterGain.gain.setTargetAtTime(0, state.audioCtx.currentTime, 0.05);
    showNotification('Sound Effects Muted', 'info');
  }
  updateSoundFxIcon();
}

function updateSoundFxIcon() {
  const icon = document.getElementById('icon-soundfx');
  if (!icon) return;
  if (state.soundFxEnabled) {
    icon.classList.remove('text-slate-400');
    icon.classList.add('text-emerald-400');
  } else {
    icon.classList.remove('text-emerald-400');
    icon.classList.add('text-slate-400');
  }
}

// -------------------------------------------------------------
// 8. VOICE NARRATION ENGINE (Web Speech API)
// -------------------------------------------------------------
function startVoiceWalkthrough(stepIndex = 0) {
  if (!state.speechSynth) {
    showNotification('Web Speech Synthesis not supported in this browser.', 'warning');
    return;
  }

  state.currentAudioStep = stepIndex;
  playCurrentNarrationStep();
}

function playCurrentNarrationStep() {
  if (!state.speechSynth) return;
  state.speechSynth.cancel();

  const stepData = narrationSteps[state.currentAudioStep];
  if (!stepData) return;

  stepData.setup();

  const subText = document.getElementById('subtitles-text');
  const subNum = document.getElementById('audio-step-num');
  if (subText) subText.textContent = stepData.text;
  if (subNum) subNum.textContent = `STEP ${stepData.step} OF ${narrationSteps.length}: ${stepData.title.toUpperCase()}`;

  const utterance = new SpeechSynthesisUtterance(stepData.text);
  utterance.rate = 1.0;
  utterance.pitch = 1.0;

  const voices = state.speechSynth.getVoices();
  const selectedVoice = voices.find(v => v.lang.includes('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha')));
  if (selectedVoice) utterance.voice = selectedVoice;

  utterance.onstart = () => {
    state.voicePlaying = true;
    updateVoiceUIState(true);
  };

  utterance.onend = () => {
    state.voicePlaying = false;
    updateVoiceUIState(false);
    if (state.mode === 'autocycle') {
      setTimeout(() => {
        state.currentAudioStep = (state.currentAudioStep + 1) % narrationSteps.length;
        playCurrentNarrationStep();
      }, 2500);
    }
  };

  utterance.onerror = (e) => {
    console.warn('Speech synthesis error:', e);
    state.voicePlaying = false;
    updateVoiceUIState(false);
  };

  state.activeUtterance = utterance;
  state.speechSynth.speak(utterance);
}

function stopVoiceWalkthrough() {
  if (state.speechSynth) {
    state.speechSynth.cancel();
  }
  state.voicePlaying = false;
  updateVoiceUIState(false);
}

function toggleVoiceNarration() {
  if (state.voicePlaying) {
    stopVoiceWalkthrough();
    showNotification('Voice Narration Paused.', 'info');
  } else {
    startVoiceWalkthrough(state.currentAudioStep);
    showNotification('Voice Narration Started.', 'info');
  }
}

function updateVoiceUIState(isPlaying) {
  const btnLabel = document.getElementById('label-voice');
  const btnIcon = document.getElementById('icon-voice');
  const bars = document.querySelectorAll('.audio-bar');

  if (isPlaying) {
    if (btnLabel) btnLabel.textContent = 'Pause Walkthrough';
    if (btnIcon) btnIcon.setAttribute('data-lucide', 'pause');
    bars.forEach(b => b.classList.remove('paused'));
  } else {
    if (btnLabel) btnLabel.textContent = 'Play Voice Walkthrough';
    if (btnIcon) btnIcon.setAttribute('data-lucide', 'volume-2');
    bars.forEach(b => b.classList.add('paused'));
  }
  if (window.lucide) lucide.createIcons();
}

// -------------------------------------------------------------
// 9. MECHANICAL KINEMATICS & PHYSICS LOOP
// -------------------------------------------------------------
function updateKinematics(deltaTime) {
  if (!state.isPaused) {
    const omega = (state.rpm * 2 * Math.PI) / 60;
    state.shaftAngle = (state.shaftAngle + omega * deltaTime * state.simSpeed) % (2 * Math.PI);
  }

  // Smooth Swashplate Pivot Angle Interpolation
  const angleDiff = state.targetSwashAngle - state.swashAngle;
  state.swashAngle += angleDiff * Math.min(1, deltaTime * 3.5);
  state.pistonStroke = 2 * 38 * Math.tan((state.swashAngle * Math.PI) / 180);

  // Volumetric Displacement & Capacity
  const angleRad = (state.swashAngle * Math.PI) / 180;
  const maxAngleRad = (22.0 * Math.PI) / 180;
  const strokeRatio = Math.tan(angleRad) / Math.tan(maxAngleRad);

  state.displacement = 8.0 + 152.0 * strokeRatio;

  // Crankcase Pressure Pc Balance
  let targetPc = 0;
  if (state.activeFault === 'ecv-stuck-open') {
    targetPc = 13.5;
  } else if (state.activeFault === 'ecv-stuck-closed') {
    targetPc = 2.4;
  } else {
    const pwmRatio = state.pwmDuty / 100;
    targetPc = 13.0 - 10.4 * pwmRatio;
  }
  state.pressureCrankcase += (targetPc - state.pressureCrankcase) * Math.min(1, deltaTime * 3.0);

  state.pressureDischarge = 11.5 + 4.5 * strokeRatio + (state.rpm / 4000) * 1.5;
  state.pressureSuction = 2.0 + 0.8 * (1 - strokeRatio);
  state.coolingPower = 0.2 + 5.8 * strokeRatio * (state.rpm / 2000);
  state.fuelDraw = 0.12 + 0.85 * strokeRatio * (state.rpm / 2000);

  // Polytropic In-Cylinder Compression Pressures
  const theta = state.shaftAngle;
  const topCompressionFrac = (1 + Math.cos(theta)) / 2; // 0 (BDC/Suction) to 1 (TDC/Discharge)
  const botCompressionFrac = (1 + Math.cos(theta + Math.PI)) / 2;

  state.pCylTop = state.pressureSuction + (state.pressureDischarge - state.pressureSuction) * Math.pow(topCompressionFrac, 1.15);
  state.pCylBot = state.pressureSuction + (state.pressureDischarge - state.pressureSuction) * Math.pow(botCompressionFrac, 1.15);

  // Update SVG Kinematics
  renderSvgKinematics();

  // Update UI Gauges
  updateTelemetryUI();

  // Update Procedural Audio
  updateAudioSynthParams();
}

function renderSvgKinematics() {
  const theta = state.shaftAngle;
  const alphaRad = (state.swashAngle * Math.PI) / 180;
  const pitchRadius = 60;

  const xTopOffset = pitchRadius * Math.tan(alphaRad) * Math.cos(theta);
  const xBottomOffset = -pitchRadius * Math.tan(alphaRad) * Math.cos(theta);

  // 1. Swashplate Slant & Hub
  const swashBody = document.getElementById('swashplate-body');
  const swashSpine = document.getElementById('swashplate-spine');
  const ballTop = document.getElementById('swash-ball-top');
  const ballBottom = document.getElementById('swash-ball-bottom');
  const shoeTop = document.getElementById('shoe-top');
  const shoeBottom = document.getElementById('shoe-bottom');
  const rodTop = document.getElementById('conn-rod-top');
  const rodBottom = document.getElementById('conn-rod-bottom');
  const angleText = document.getElementById('angle-text');

  const topX = 270 + 180 * Math.sin(alphaRad) * Math.cos(theta);
  const bottomX = 270 - 180 * Math.sin(alphaRad) * Math.cos(theta);

  if (swashBody && swashSpine) {
    swashBody.setAttribute('x1', topX + 50);
    swashBody.setAttribute('y1', 160);
    swashBody.setAttribute('x2', bottomX - 50);
    swashBody.setAttribute('y2', 560);

    swashSpine.setAttribute('x1', topX + 50);
    swashSpine.setAttribute('y1', 160);
    swashSpine.setAttribute('x2', bottomX - 50);
    swashSpine.setAttribute('y2', 560);
  }

  const pTopX = 380 + xTopOffset;
  const pBottomX = 380 + xBottomOffset;

  if (ballTop) { ballTop.setAttribute('cx', topX + 40); ballTop.setAttribute('cy', 180); }
  if (ballBottom) { ballBottom.setAttribute('cx', bottomX - 40); ballBottom.setAttribute('cy', 540); }
  if (shoeTop) { shoeTop.setAttribute('x', topX + 26); shoeTop.setAttribute('y', 166); }
  if (shoeBottom) { shoeBottom.setAttribute('x', bottomX - 54); shoeBottom.setAttribute('y', 526); }

  if (rodTop) { rodTop.setAttribute('x1', topX + 40); rodTop.setAttribute('y1', 180); rodTop.setAttribute('x2', pTopX); rodTop.setAttribute('y2', 180); }
  if (rodBottom) { rodBottom.setAttribute('x1', bottomX - 40); rodBottom.setAttribute('y1', 540); rodBottom.setAttribute('x2', pBottomX); rodBottom.setAttribute('y2', 540); }

  if (angleText) angleText.textContent = `α = ${state.swashAngle.toFixed(1)}°`;

  // 2. Top Piston Body
  const pTopBody = document.getElementById('piston-top-body');
  const pTopR1 = document.getElementById('piston-top-r1');
  const pTopR2 = document.getElementById('piston-top-r2');
  const pTopLabel = document.getElementById('piston-top-label');
  const pTopPocket = document.getElementById('piston-top-pocket');

  if (pTopBody) pTopBody.setAttribute('x', pTopX);
  if (pTopR1) { pTopR1.setAttribute('x1', pTopX + 150); pTopR1.setAttribute('x2', pTopX + 150); }
  if (pTopR2) { pTopR2.setAttribute('x1', pTopX + 165); pTopR2.setAttribute('x2', pTopX + 165); }
  if (pTopLabel) pTopLabel.setAttribute('x', pTopX + 70);
  if (pTopPocket) pTopPocket.setAttribute('cx', pTopX);

  // 3. Bottom Piston Body
  const pBotBody = document.getElementById('piston-bottom-body');
  const pBotR1 = document.getElementById('piston-bottom-r1');
  const pBotR2 = document.getElementById('piston-bottom-r2');
  const pBotLabel = document.getElementById('piston-bottom-label');
  const pBotPocket = document.getElementById('piston-bottom-pocket');

  if (pBotBody) pBotBody.setAttribute('x', pBottomX);
  if (pBotR1) { pBotR1.setAttribute('x1', pBottomX + 150); pBotR1.setAttribute('x2', pBottomX + 150); }
  if (pBotR2) { pBotR2.setAttribute('x1', pBottomX + 165); pBotR2.setAttribute('x2', pBottomX + 165); }
  if (pBotLabel) pBotLabel.setAttribute('x', pBottomX + 70);
  if (pBotPocket) pBotPocket.setAttribute('cx', pBottomX);

  // 4. Helical Spring Compression on Shaft
  const springPath = document.getElementById('spring-path');
  if (springPath) {
    const springLen = 120 - 40 * (state.swashAngle / 22);
    const sStart = 140;
    const sEnd = sStart + springLen;
    const step = (sEnd - sStart) / 8;
    springPath.setAttribute('d', `M ${sStart} 335 L ${sStart + step} 385 L ${sStart + 2*step} 335 L ${sStart + 3*step} 385 L ${sStart + 4*step} 335 L ${sStart + 5*step} 385 L ${sStart + 6*step} 335 L ${sStart + 7*step} 385 L ${sEnd} 335`);
  }

  // 5. Animated Reed Valves on Cylinder Head
  const reedSucTop = document.getElementById('reed-suc-top');
  const reedDisTop = document.getElementById('reed-dis-top');
  const reedSucBot = document.getElementById('reed-suc-bot');
  const reedDisBot = document.getElementById('reed-dis-bot');

  // Suction stroke occurs when velocity is moving toward BDC (sin > 0)
  const isTopIntake = Math.sin(theta) > 0.1;
  const isTopDischarge = Math.cos(theta) > 0.85;
  const isBotIntake = Math.sin(theta + Math.PI) > 0.1;
  const isBotDischarge = Math.cos(theta + Math.PI) > 0.85;

  if (reedSucTop) reedSucTop.setAttribute('transform', isTopIntake ? 'rotate(-25, 0, 30)' : 'rotate(0, 0, 30)');
  if (reedDisTop) reedDisTop.setAttribute('transform', isTopDischarge ? 'rotate(28, 0, 80)' : 'rotate(0, 0, 80)');
  if (reedSucBot) reedSucBot.setAttribute('transform', isBotIntake ? 'rotate(-25, 0, 80)' : 'rotate(0, 0, 80)');
  if (reedDisBot) reedDisBot.setAttribute('transform', isBotDischarge ? 'rotate(28, 0, 30)' : 'rotate(0, 0, 30)');

  // 6. Mini Integrated ECV & Dedicated ECV Inset Cutaway
  const miniNeedle = document.getElementById('mini-ecv-needle');
  const miniStatus = document.getElementById('mini-ecv-status');
  const miniCoil = document.getElementById('mini-ecv-coil');

  const largeSpool = document.getElementById('ecv-large-spool');
  const largeCoil = document.getElementById('ecv-large-coil');
  const largeBadgeBg = document.getElementById('ecv-panel-badge-bg');
  const largeBadgeTxt = document.getElementById('ecv-panel-badge-txt');
  const arrPath1 = document.getElementById('ecv-arr-path1');
  const arrHead1 = document.getElementById('ecv-arr-head1');
  const arrPath2 = document.getElementById('ecv-arr-path2');
  const arrHead2 = document.getElementById('ecv-arr-head2');
  const desc1 = document.getElementById('ecv-cutaway-desc1');
  const desc2 = document.getElementById('ecv-cutaway-desc2');

  const needleY = (state.pwmDuty / 100) * 14;
  const largeSpoolY = (state.pwmDuty / 100) * 26;

  if (miniNeedle) miniNeedle.setAttribute('transform', `translate(0, ${needleY})`);
  if (largeSpool) largeSpool.setAttribute('transform', `translate(0, ${largeSpoolY})`);

  if (state.pwmDuty > 50) {
    if (miniStatus) { miniStatus.textContent = '(closed)'; miniStatus.className = 'fill-cyan-400 font-mono font-bold text-xs'; }
    if (miniCoil) miniCoil.classList.add('coil-energized');
    if (largeCoil) largeCoil.classList.add('coil-energized');
    
    if (largeBadgeBg) { largeBadgeBg.setAttribute('fill', '#0284c7'); largeBadgeBg.setAttribute('stroke', '#38bdf8'); }
    if (largeBadgeTxt) { largeBadgeTxt.textContent = 'CLOSED (BLEED TO Ps)'; largeBadgeTxt.className = 'fill-cyan-400 font-mono font-bold text-[11px]'; }

    if (arrPath1 && arrHead1) { arrPath1.classList.add('hidden'); arrHead1.classList.add('hidden'); }
    if (arrPath2 && arrHead2) { arrPath2.classList.remove('hidden'); arrHead2.classList.remove('hidden'); }

    if (desc1) desc1.textContent = 'Solenoid On / Closed: Discharge port sealed.';
    if (desc2) { desc2.textContent = 'Crankcase gas vents to Suction (Pc ↓ -> Stroke 100%)'; desc2.className = 'fill-cyan-400 font-bold text-xs'; }
  } else {
    if (miniStatus) { miniStatus.textContent = '(open)'; miniStatus.className = 'fill-amber-400 font-mono font-bold text-xs'; }
    if (miniCoil) miniCoil.classList.remove('coil-energized');
    if (largeCoil) largeCoil.classList.remove('coil-energized');

    if (largeBadgeBg) { largeBadgeBg.setAttribute('fill', '#f59e0b'); largeBadgeBg.setAttribute('stroke', '#f59e0b'); }
    if (largeBadgeTxt) { largeBadgeTxt.textContent = 'OPEN (BLEED Pc)'; largeBadgeTxt.className = 'fill-amber-400 font-mono font-bold text-[11px]'; }

    if (arrPath1 && arrHead1) { arrPath1.classList.remove('hidden'); arrHead1.classList.remove('hidden'); }
    if (arrPath2 && arrHead2) { arrPath2.classList.add('hidden'); arrHead2.classList.add('hidden'); }

    if (desc1) desc1.textContent = 'Solenoid Off / Open: High-Pressure Pd';
    if (desc2) { desc2.textContent = 'flows directly to Crankcase (Pc ↑ -> Destroke 5%)'; desc2.className = 'fill-amber-400 font-bold text-xs'; }
  }

  // 7. Dynamic Compression Chamber Pressure Hue
  const topChamber = document.getElementById('comp-chamber-top');
  const botChamber = document.getElementById('comp-chamber-bottom');
  if (topChamber) {
    const pFracTop = (state.pCylTop - state.pressureSuction) / (state.pressureDischarge - state.pressureSuction);
    topChamber.setAttribute('fill', pFracTop > 0.6 ? '#ef4444' : pFracTop > 0.2 ? '#f59e0b' : '#38bdf8');
    topChamber.setAttribute('fill-opacity', `${0.2 + 0.65 * pFracTop}`);
  }
  if (botChamber) {
    const pFracBot = (state.pCylBot - state.pressureSuction) / (state.pressureDischarge - state.pressureSuction);
    botChamber.setAttribute('fill', pFracBot > 0.6 ? '#ef4444' : pFracBot > 0.2 ? '#f59e0b' : '#38bdf8');
    botChamber.setAttribute('fill-opacity', `${0.2 + 0.65 * pFracBot}`);
  }
}

function updateTelemetryUI() {
  const gAngle = document.getElementById('gauge-angle');
  const gDisp = document.getElementById('gauge-disp');
  const gPc = document.getElementById('gauge-pc');
  const gPd = document.getElementById('gauge-pd');
  const gCooling = document.getElementById('gauge-cooling');
  const gFuel = document.getElementById('gauge-fuel');

  const bAngle = document.getElementById('bar-angle');
  const bDisp = document.getElementById('bar-disp');
  const bPc = document.getElementById('bar-pc');
  const bPd = document.getElementById('bar-pd');

  const badgeStatus = document.getElementById('badge-status-text');
  const badgeDot = document.getElementById('badge-status-dot');
  const loadBadge = document.getElementById('load-badge');
  const stateBadgeNum = document.getElementById('state-badge-num');

  if (gAngle) gAngle.textContent = state.swashAngle.toFixed(1);
  if (gDisp) gDisp.textContent = state.displacement.toFixed(1);
  if (gPc) gPc.textContent = state.pressureCrankcase.toFixed(1);
  if (gPd) gPd.textContent = state.pressureDischarge.toFixed(1);
  if (gCooling) gCooling.textContent = `${state.coolingPower.toFixed(1)} kW`;
  if (gFuel) gFuel.textContent = `${state.fuelDraw.toFixed(2)} L/hr`;

  if (bAngle) bAngle.style.width = `${Math.min(100, (state.swashAngle / 22) * 100)}%`;
  if (bDisp) bDisp.style.width = `${Math.min(100, (state.displacement / 160) * 100)}%`;
  if (bPc) bPc.style.width = `${Math.min(100, (state.pressureCrankcase / 16) * 100)}%`;
  if (bPd) bPd.style.width = `${Math.min(100, (state.pressureDischarge / 20) * 100)}%`;

  if (loadBadge) {
    const pct = Math.round((state.displacement / 160) * 100);
    loadBadge.textContent = `${pct}% DISPLACEMENT`;
    if (pct > 50) {
      loadBadge.className = 'text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-400 font-bold border border-cyan-500/30';
    } else {
      loadBadge.className = 'text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 font-bold border border-amber-500/30';
    }
  }

  if (stateBadgeNum) {
    stateBadgeNum.textContent = state.pwmDuty > 50 ? '2' : '1';
    stateBadgeNum.className = state.pwmDuty > 50 ? 'fill-cyan-400 font-black text-xl font-mono' : 'fill-amber-400 font-black text-xl font-mono';
  }

  if (badgeStatus && badgeDot) {
    if (state.activeFault) {
      badgeStatus.textContent = `ALERT: ${state.activeFault.toUpperCase()}`;
      badgeStatus.className = 'text-xs font-mono font-bold text-rose-400 uppercase animate-pulse';
      badgeDot.className = 'w-2.5 h-2.5 rounded-full bg-rose-500';
    } else if (state.pwmDuty > 70) {
      badgeStatus.textContent = `STATE (2): ECV CLOSED (FULL STROKE 100%)`;
      badgeStatus.className = 'text-xs font-mono font-bold text-cyan-400 uppercase';
      badgeDot.className = 'w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse';
    } else if (state.pwmDuty < 30) {
      badgeStatus.textContent = `STATE (1): ECV OPEN (DESTROKED 5%)`;
      badgeStatus.className = 'text-xs font-mono font-bold text-amber-400 uppercase';
      badgeDot.className = 'w-2.5 h-2.5 rounded-full bg-amber-400';
    } else {
      badgeStatus.textContent = `DYNAMIC PWM: ${state.pwmDuty}% DUTY CYCLE`;
      badgeStatus.className = 'text-xs font-mono font-bold text-purple-400 uppercase';
      badgeDot.className = 'w-2.5 h-2.5 rounded-full bg-purple-400 animate-ping';
    }
  }
}

// -------------------------------------------------------------
// 10. OPERATING MODES & CONTROLLER HANDLERS
// -------------------------------------------------------------
function setOperatingMode(modeKey) {
  state.mode = modeKey;
  
  document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.getElementById(`btn-mode-${modeKey}`);
  if (activeBtn) activeBtn.classList.add('active');

  if (modeKey === 'state1') {
    state.pwmDuty = 0;
    state.targetSwashAngle = 3.5;
    updateControlInputs();
    showNotification('State (1) Active: ECV Solenoid Open -> Destroked (5% Load)', 'info');
  } else if (modeKey === 'state2') {
    state.pwmDuty = 100;
    state.targetSwashAngle = 21.0;
    updateControlInputs();
    showNotification('State (2) Active: ECV Solenoid Closed -> Full Stroke (100% Load)', 'success');
  } else if (modeKey === 'pwm') {
    state.pwmDuty = 50;
    state.targetSwashAngle = 12.0;
    updateControlInputs();
    showNotification('Dynamic PWM Mode: Drag slider to continuously modulate stroke.', 'info');
  } else if (modeKey === 'autocycle') {
    showNotification('Auto-Cycle Demo Mode: Cycling between operating regimes.', 'info');
    startVoiceWalkthrough(0);
  }
}

function updateControlInputs() {
  const sliderPwm = document.getElementById('slider-pwm');
  const labelPwm = document.getElementById('label-pwm');
  if (sliderPwm) sliderPwm.value = state.pwmDuty;
  if (labelPwm) {
    if (state.pwmDuty === 0) labelPwm.textContent = '0% (De-energized / Open)';
    else if (state.pwmDuty === 100) labelPwm.textContent = '100% (Energized / Closed)';
    else labelPwm.textContent = `${state.pwmDuty}% (PWM Modulated)`;
  }
  state.targetSwashAngle = 3.0 + 18.5 * (state.pwmDuty / 100);
}

// -------------------------------------------------------------
// 11. COMPONENT INSPECTOR & HOTSPOT CONTROLLER
// -------------------------------------------------------------
function inspectComponent(partKey) {
  const data = partsData[partKey];
  if (!data) return;

  state.inspectedPart = partKey;

  document.querySelectorAll('.interactive-part').forEach(p => p.classList.remove('part-active'));
  const activeEl = document.querySelector(`[data-part="${partKey}"]`);
  if (activeEl) activeEl.classList.add('part-active');

  const titleEl = document.getElementById('insp-title');
  const typeBadge = document.getElementById('insp-type-badge');
  const descEl = document.getElementById('insp-desc');
  const v1El = document.getElementById('insp-val-1');
  const v2El = document.getElementById('insp-val-2');
  const actionBtn = document.getElementById('btn-insp-action');
  const actionLabel = document.getElementById('insp-action-label');

  if (titleEl) titleEl.textContent = data.title;
  if (typeBadge) typeBadge.textContent = data.type;
  if (descEl) descEl.textContent = data.desc;
  if (v1El) v1El.textContent = typeof data.val1 === 'function' ? data.val1() : data.val1;
  if (v2El) v2El.textContent = typeof data.val2 === 'function' ? data.val2() : data.val2;

  if (actionLabel) actionLabel.textContent = data.actionLabel;
  if (actionBtn) {
    actionBtn.onclick = () => {
      if (typeof data.actionFn === 'function') data.actionFn();
    };
  }
}

// -------------------------------------------------------------
// 12. FAULT INJECTION LAB
// -------------------------------------------------------------
function injectFault(faultKey) {
  state.activeFault = faultKey;
  
  document.querySelectorAll('.fault-btn').forEach(btn => {
    if (btn.getAttribute('data-fault') === faultKey) {
      btn.classList.add('border-rose-500', 'bg-rose-950/40');
    } else {
      btn.classList.remove('border-rose-500', 'bg-rose-950/40');
    }
  });

  if (faultKey === 'ecv-stuck-open') {
    state.targetSwashAngle = 2.5;
    inspectComponent('ecv-valve');
    showNotification('FAULT ACTIVE: ECV Stuck Open. Crankcase pressure locked high; no cabin cooling.', 'danger');
  } else if (faultKey === 'ecv-stuck-closed') {
    state.targetSwashAngle = 22.0;
    inspectComponent('ecv-valve');
    showNotification('FAULT ACTIVE: ECV Stuck Closed. Continuous 100% stroke; evaporator icing risk.', 'warning');
  }
}

function clearFaults() {
  state.activeFault = null;
  document.querySelectorAll('.fault-btn').forEach(btn => {
    btn.classList.remove('border-rose-500', 'bg-rose-950/40');
  });
  updateControlInputs();
  showNotification('All faults cleared. System normalized.', 'success');
}

// -------------------------------------------------------------
// 13. QUIZ CONTROLLER
// -------------------------------------------------------------
function openQuizModal() {
  const modal = document.getElementById('quiz-modal');
  if (!modal) return;
  state.quizIndex = 0;
  state.quizScore = 0;
  state.quizSelectedOpt = null;
  renderQuizQuestion();
  modal.classList.remove('hidden');
}

function renderQuizQuestion() {
  const qData = quizQuestions[state.quizIndex];
  const container = document.getElementById('quiz-content');
  const progress = document.getElementById('quiz-progress');
  const nextBtn = document.getElementById('btn-quiz-next');

  if (progress) progress.textContent = `Question ${state.quizIndex + 1} of ${quizQuestions.length}`;
  if (nextBtn) nextBtn.innerHTML = '<span>Submit Answer</span> <i data-lucide="arrow-right" class="w-4 h-4"></i>';
  if (window.lucide) lucide.createIcons();

  if (!container) return;
  container.innerHTML = `
    <div class="space-y-3">
      <h3 class="text-sm md:text-base font-semibold text-slate-100">${qData.q}</h3>
      <div class="space-y-2">
        ${qData.options.map((opt, i) => `
          <button data-opt-idx="${i}" class="quiz-opt-btn w-full text-left p-3 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-xs text-slate-200 transition-all">
            <span class="font-bold text-cyan-400 mr-2">${String.fromCharCode(65 + i)}.</span> ${opt}
          </button>
        `).join('')}
      </div>
      <div id="quiz-feedback-box" class="hidden p-3 rounded-xl text-xs"></div>
    </div>
  `;

  document.querySelectorAll('.quiz-opt-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.quiz-opt-btn').forEach(b => b.classList.remove('border-cyan-500', 'bg-cyan-950/60'));
      btn.classList.add('border-cyan-500', 'bg-cyan-950/60');
      state.quizSelectedOpt = parseInt(btn.getAttribute('data-opt-idx'), 10);
    });
  });
}

function handleQuizSubmit() {
  const qData = quizQuestions[state.quizIndex];
  const feedbackBox = document.getElementById('quiz-feedback-box');
  const nextBtn = document.getElementById('btn-quiz-next');

  if (state.quizSelectedOpt === null) {
    showNotification('Please select an option first.', 'warning');
    return;
  }

  if (feedbackBox && !feedbackBox.classList.contains('hidden')) {
    state.quizIndex++;
    state.quizSelectedOpt = null;
    if (state.quizIndex < quizQuestions.length) {
      renderQuizQuestion();
    } else {
      showQuizResults();
    }
    return;
  }

  const isCorrect = state.quizSelectedOpt === qData.correct;
  if (isCorrect) state.quizScore++;

  if (feedbackBox) {
    feedbackBox.classList.remove('hidden');
    feedbackBox.className = `p-3.5 rounded-xl text-xs border ${isCorrect ? 'bg-emerald-950/60 border-emerald-500 text-emerald-200' : 'bg-rose-950/60 border-rose-500 text-rose-200'}`;
    feedbackBox.innerHTML = `
      <div class="font-bold mb-1 flex items-center gap-1.5">
        <i data-lucide="${isCorrect ? 'check-circle' : 'alert-circle'}" class="w-4 h-4"></i>
        ${isCorrect ? 'Correct!' : 'Incorrect.'}
      </div>
      <p>${qData.explanation}</p>
    `;
  }

  document.querySelectorAll('.quiz-opt-btn').forEach((btn, idx) => {
    if (idx === qData.correct) {
      btn.classList.add('border-emerald-500', 'bg-emerald-950/60', 'text-emerald-200');
    } else if (idx === state.quizSelectedOpt && !isCorrect) {
      btn.classList.add('border-rose-500', 'bg-rose-950/60', 'text-rose-200');
    }
  });

  if (nextBtn) {
    nextBtn.innerHTML = `<span>${state.quizIndex + 1 < quizQuestions.length ? 'Next Question' : 'View Results'}</span> <i data-lucide="arrow-right" class="w-4 h-4"></i>`;
  }
  if (window.lucide) lucide.createIcons();
}

function showQuizResults() {
  const container = document.getElementById('quiz-content');
  const progress = document.getElementById('quiz-progress');
  const nextBtn = document.getElementById('btn-quiz-next');

  if (progress) progress.textContent = 'Quiz Finished!';
  if (nextBtn) {
    nextBtn.innerHTML = '<span>Restart Quiz</span> <i data-lucide="rotate-ccw" class="w-4 h-4"></i>';
    nextBtn.onclick = () => openQuizModal();
  }

  const pct = Math.round((state.quizScore / quizQuestions.length) * 100);
  let gradeBadge = pct >= 80 ? 'Master HVAC Specialist (Level 3)' : pct >= 60 ? 'Certified Technician (Level 2)' : 'Apprentice (Level 1)';

  if (container) {
    container.innerHTML = `
      <div class="text-center py-6 space-y-4">
        <div class="w-16 h-16 rounded-2xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 mx-auto flex items-center justify-center text-2xl font-bold font-mono">
          ${pct}%
        </div>
        <div>
          <h3 class="text-lg font-bold text-white">Score: ${state.quizScore} / ${quizQuestions.length} Correct</h3>
          <span class="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 mt-2">
            ${gradeBadge}
          </span>
        </div>
        <p class="text-xs text-slate-300 max-w-md mx-auto">
          ${pct >= 80 ? 'Outstanding mastery of variable displacement swashplate kinematics, electronic control valve thermodynamics, and PWM modulation!' : 'Great effort! Re-listen to the voice walkthrough to reinforce the crankcase pressure force balance.'}
        </p>
      </div>
    `;
  }
  if (window.lucide) lucide.createIcons();
}

// -------------------------------------------------------------
// 14. NOTIFICATIONS & UTILITIES
// -------------------------------------------------------------
function showNotification(msg, type = 'info') {
  const existing = document.getElementById('app-notification');
  if (existing) existing.remove();

  const el = document.createElement('div');
  el.id = 'app-notification';
  let color = 'bg-cyan-600 text-white border-cyan-400';
  if (type === 'success') color = 'bg-emerald-600 text-white border-emerald-400';
  if (type === 'warning') color = 'bg-amber-600 text-white border-amber-400';
  if (type === 'danger') color = 'bg-rose-600 text-white border-rose-400';

  el.className = `fixed top-20 right-6 z-50 px-4 py-2.5 rounded-xl text-xs font-semibold shadow-2xl border transition-all duration-300 transform translate-y-0 opacity-100 flex items-center gap-2 ${color}`;
  el.innerHTML = `<i data-lucide="info" class="w-4 h-4"></i> <span>${msg}</span>`;

  document.body.appendChild(el);
  if (window.lucide) lucide.createIcons();

  setTimeout(() => {
    el.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => el.remove(), 300);
  }, 3200);
}

function exportDiagramSnapshot() {
  const svg = document.getElementById('compressor-svg');
  if (!svg) return;

  const svgData = new XMLSerializer().serializeToString(svg);
  const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `ac-compressor-control-valve-${new Date().toISOString().slice(0, 10)}.svg`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showNotification('High-Resolution Vector SVG Diagram Exported.', 'success');
}

// -------------------------------------------------------------
// 15. INITIALIZATION & EVENT LISTENERS
// -------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('particle-canvas');
  const particleSim = new ParticleFlowSimulation(canvas);

  const pvCanvas = document.getElementById('pv-canvas');
  const pvEngine = new PvDiagramEngine(pvCanvas);

  let lastTime = performance.now();
  function animationLoop(now) {
    const deltaTime = Math.min(0.1, (now - lastTime) / 1000);
    lastTime = now;

    updateKinematics(deltaTime);
    particleSim.update(deltaTime);
    particleSim.draw();
    pvEngine.draw();

    requestAnimationFrame(animationLoop);
  }
  requestAnimationFrame(animationLoop);

  // Mode Switchers
  document.getElementById('btn-mode-state1')?.addEventListener('click', () => setOperatingMode('state1'));
  document.getElementById('btn-mode-state2')?.addEventListener('click', () => setOperatingMode('state2'));
  document.getElementById('btn-mode-pwm')?.addEventListener('click', () => setOperatingMode('pwm'));
  document.getElementById('btn-mode-autocycle')?.addEventListener('click', () => setOperatingMode('autocycle'));

  // Voice Narration
  document.getElementById('btn-voice-narrate')?.addEventListener('click', toggleVoiceNarration);
  document.getElementById('btn-sub-prev')?.addEventListener('click', () => {
    state.currentAudioStep = Math.max(0, state.currentAudioStep - 1);
    playCurrentNarrationStep();
  });
  document.getElementById('btn-sub-next')?.addEventListener('click', () => {
    state.currentAudioStep = (state.currentAudioStep + 1) % narrationSteps.length;
    playCurrentNarrationStep();
  });

  // Sound FX Toggle
  document.getElementById('btn-soundfx')?.addEventListener('click', toggleSoundFx);

  // Play / Pause Simulation
  const playPauseBtn = document.getElementById('btn-sim-playpause');
  const playPauseIcon = document.getElementById('icon-sim-playpause');
  playPauseBtn?.addEventListener('click', () => {
    state.isPaused = !state.isPaused;
    if (playPauseIcon) playPauseIcon.setAttribute('data-lucide', state.isPaused ? 'play' : 'pause');
    if (window.lucide) lucide.createIcons();
    showNotification(state.isPaused ? 'Motion Kinematics Paused' : 'Motion Kinematics Resumed', 'info');
  });

  // Speed Buttons
  document.querySelectorAll('.speed-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('bg-cyan-600', 'text-white', 'font-bold'));
      btn.classList.add('bg-cyan-600', 'text-white', 'font-bold');
      state.simSpeed = parseFloat(btn.getAttribute('data-speed'));
      showNotification(`Simulation Speed: ${state.simSpeed}x`, 'info');
    });
  });

  // Sliders
  document.getElementById('slider-pwm')?.addEventListener('input', (e) => {
    state.pwmDuty = parseInt(e.target.value, 10);
    updateControlInputs();
  });

  document.getElementById('slider-rpm')?.addEventListener('input', (e) => {
    state.rpm = parseInt(e.target.value, 10);
    const label = document.getElementById('label-rpm');
    if (label) label.textContent = `${state.rpm.toLocaleString()} RPM`;
  });

  document.getElementById('slider-temp')?.addEventListener('input', (e) => {
    state.cabinTemp = parseFloat(e.target.value);
    const label = document.getElementById('label-temp');
    if (label) label.textContent = `${state.cabinTemp.toFixed(1)} °C (${state.cabinTemp < 20 ? 'High Demand' : state.cabinTemp < 26 ? 'Moderate' : 'Low Demand'})`;
    
    if (state.mode === 'pwm') {
      const demandDuty = Math.round(Math.max(0, Math.min(100, (30 - state.cabinTemp) * 7.5)));
      state.pwmDuty = demandDuty;
      updateControlInputs();
    }
  });

  // Theme Dropdown
  const themeBtn = document.getElementById('btn-theme');
  const themeDropdown = document.getElementById('theme-dropdown');
  themeBtn?.addEventListener('click', () => themeDropdown?.classList.toggle('hidden'));

  document.querySelectorAll('[data-theme]').forEach(btn => {
    btn.addEventListener('click', () => {
      const theme = btn.getAttribute('data-theme');
      document.body.className = `theme-${theme} min-h-screen flex flex-col`;
      themeDropdown?.classList.add('hidden');
      showNotification(`Theme set to ${btn.textContent.trim()}`, 'info');
    });
  });

  // Export SVG
  document.getElementById('btn-export-svg')?.addEventListener('click', exportDiagramSnapshot);

  // Fault Injection Buttons
  document.querySelectorAll('.fault-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const fault = btn.getAttribute('data-fault');
      if (state.activeFault === fault) {
        clearFaults();
      } else {
        injectFault(fault);
      }
    });
  });
  document.getElementById('btn-clear-faults')?.addEventListener('click', clearFaults);

  // SVG Hotspots Inspection
  document.querySelectorAll('.interactive-part').forEach(part => {
    part.addEventListener('click', () => {
      const key = part.getAttribute('data-part');
      if (key) inspectComponent(key);
    });
  });

  // Quiz Modal Controls
  document.getElementById('btn-open-quiz')?.addEventListener('click', openQuizModal);
  document.getElementById('btn-close-quiz')?.addEventListener('click', () => {
    document.getElementById('quiz-modal')?.classList.add('hidden');
  });
  document.getElementById('btn-quiz-next')?.addEventListener('click', handleQuizSubmit);

  // Inspect default part
  inspectComponent('ecv-valve');
});
