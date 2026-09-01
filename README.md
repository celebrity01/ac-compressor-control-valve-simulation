# 🚗 Automotive AC Compressor Control Valve: Precision Kinematics & Audio Simulation

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fcelebrity01%2Fac-compressor-control-valve-simulation)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![HTML5](https://img.shields.io/badge/HTML5-Canvas%20%26%20SVG-orange.svg)]()
[![Web Audio](https://img.shields.io/badge/Web%20Audio-Procedural%20Synth-green.svg)]()
[![Web Speech](https://img.shields.io/badge/Web%20Speech-Voice%20Narration-purple.svg)]()

An interactive, high-fidelity **motion simulation and audio-narrated educational digital twin** of a **Variable Displacement Automotive AC Compressor with Electronic Control Valve (ECV)**.

---

## 🚀 One-Click Deploy to Vercel

Click the button below to deploy this project directly to your Vercel account:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fcelebrity01%2Fac-compressor-control-valve-simulation)

---

## 📸 Architecture & Kinematic Principles

```
┌─────────────────────────────────────────────────────────────┬──────────────────────────────────────┐
│             HIGH-ACCURACY COMPRESSOR ASSEMBLY               │        DEDICATED ECV CUTAWAY         │
│   • Rotating Drive Shaft with Dual Helical Springs          │   • Solenoid Coil & Armature Spring  │
│   • Swashplate with Double Clamped Slipper Shoes            │   • Moveable Green Spool/Needle      │
│   • Dynamic Suction & Discharge Reed Valves (Flexing)       │   • Upper Crankcase Channel (Pc)     │
│   • Polytropic In-Cylinder Compression (Cyan→Amber→Red)     │   • Lower Discharge Channel (Pd)     │
│   • Suction & Discharge Manifolds (Completely Unblocked)    │   • Dynamic Directional White Arrows │
└─────────────────────────────────────────────────────────────┴──────────────────────────────────────┘
```

### 1. State (1): Electronic Control Valve Open (Destroked 5%)
- Solenoid de-energized or pulsed at low PWM duty cycle ($0\%$).
- High-pressure discharge refrigerant gas ($P_d$) flows through the open control valve into the compressor **Crankcase Chamber** ($P_c$).
- Crankcase pressure ($P_c$) rises relative to suction pressure ($P_s$).
- Pressure force on the backside of the pistons pushes the swashplate against the return spring into a nearly vertical angle ($\alpha \approx 2^\circ - 5^\circ$).
- Piston stroke length is minimized ($S \approx 2 - 4\text{ mm}$), reducing displacement to $\approx 5\%$, saving engine fuel and preventing evaporator freeze-up.

### 2. State (2): Electronic Control Valve Closed (Full Stroke 100%)
- Solenoid energized at high PWM duty cycle ($100\%$).
- The valve needle seals off the discharge gas port.
- Crankcase gas bleeds down to the low-pressure suction port through the internal shaft bleed passage.
- Crankcase pressure ($P_c$) drops to near suction pressure ($P_s$).
- Drive spring and cylinder pressures force the swashplate to pivot to its maximum tilt angle ($\alpha \approx 18^\circ - 22^\circ$).
- Pistons execute full-depth reciprocating strokes ($S \approx 25 - 30\text{ mm}$), delivering maximum displacement ($100\%$) and rapid cabin cooling.

---

## 🌟 Key Application Features

1. **60 FPS Vector Kinematics Engine**: Synchronized drive shaft, tilting swashplate, slipper shoes, and dual opposed reciprocating pistons.
2. **Dynamic Reed Valves**: Suction and discharge spring-steel reed valves that flex open/close according to in-cylinder pressure differential.
3. **Live $P$-$V$ Indicator Diagram Canvas**: Real-time plotting of in-cylinder pressure ($P$) against volume ($V$) according to the polytropic gas compression law ($P V^{1.15} = \text{const}$).
4. **Synchronized Voice Narration (Web Speech API)**: Multi-stage spoken audio walkthrough with live subtitle banner and progress navigation.
5. **Procedural Web Audio Synthesizer**: Generates 60Hz induction motor hum, reciprocating thrum, and 400Hz PWM solenoid buzzing without external audio files.
6. **Fault Injection Lab**: Test failure modes including *ECV Stuck Open* (loss of cooling) and *ECV Stuck Closed* (evaporator freeze risk).
7. **5-Question Mastery Quiz**: Interactive test with instant scoring and explanations.
8. **3 Themes**: Dark SCADA, Engineering Blueprint, and Clean Light with 1-click vector SVG schematic export.

---

## 🛠️ Local Development & Quick Start

Simply clone the repository and serve the static files:

```bash
git clone https://github.com/celebrity01/ac-compressor-control-valve-simulation.git
cd ac-compressor-control-valve-simulation

# Start a local static server
python -m http.server 8080
```

Open `http://localhost:8080` in your web browser.

---

## 📄 License

MIT License © 2026 SANI ZAHARADEEN
