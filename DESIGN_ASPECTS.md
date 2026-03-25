# Particle Artwork Tool - Design Rationale

## Why I Made This Tool

I wanted to make an interactive "digital mirror" that feels more expressive than a normal camera filter. Instead of simply placing effects on top of the user, this tool turns body movement into living visuals, so the person becomes part of the composition process. As a student project, it was a way to explore how motion, emotion, and identity can be translated into visual language.

Another motivation was to create a bridge between performance and graphic design. In many classes, composition is treated as static, but this project experiments with composition as something that changes over time through gestures, rhythm, and presence.

## How It Can Be Used in Visual Communication Design

This tool can support early ideation and concept exploration in several ways:

- It can be used as a **motion sketchbook** for testing how visual forms respond to human behavior.
- It helps explore **symbolic interaction** (for example, heart gestures creating heart-shaped particle fields).
- It provides a way to prototype **embodied interfaces**, where communication comes from movement rather than menus.
- It can generate visual references for poster, branding, or campaign systems focused on themes like identity, emotion, and interactivity.

In a studio workflow, a designer could capture screenshots or recordings from different gestures and use those outputs as source material for storyboards, animation styleframes, or experimental editorial layouts.

## My Design Thinking Process

I approached the project in four phases:

1. **Intent and audience**  
   I defined the experience as playful and exploratory, aimed at classmates and critique viewers who could quickly understand and test the system.

2. **Interaction-first prototyping**  
   I focused on hand and face input before visual polish, because the core design question was whether body movement could feel like a design tool.

3. **Visual behavior tuning**  
   I adjusted particle speed, glow, density, and color shifts so the output felt intentional rather than random. The goal was "controlled chaos": expressive, but readable.

4. **Reflection and legibility**  
   I added debug and status layers to make the system understandable during critique. This supports design reflection by showing how invisible system logic affects visible form.

## Key UI/UX Design Decisions (and Why)

- **Two-scene entry menu (Hand Gestures / Face Particles)**  
  I separated the experience into two cards so users can choose interaction mode immediately and avoid cognitive overload from too many controls at startup.

- **Dark, minimal visual framing**  
  A near-black background and soft neon accents keep attention on particle behavior. This creates high contrast and supports a "gallery installation" mood.

- **Camera-hidden interaction model**  
  The webcam feed is mostly hidden in the main view so users perceive themselves through abstracted particles, not a literal camera image. This encourages interpretation over self-surveillance.

- **Gesture-to-feedback mapping**  
  Pinch, clap, and heart gestures each trigger a distinct particle behavior. This makes interaction learnable: users can quickly connect action and visual response.

- **Integrated debug panels**  
  I treated debugging UI as part of design documentation, not only engineering support. By exposing landmarks, overlays, and performance modes, the interface helps explain "why the visual behaves this way."

- **Shared status and back navigation**  
  A persistent status line and clear back button reduce interaction friction and help users recover when switching modes or troubleshooting camera/mic permissions.

## Brief Note on Development Process

Development was iterative: prototype interaction, test with live camera input, tune visual behavior, then improve clarity through UI controls and debug instrumentation. While technical systems (MediaPipe tracking, particle simulation, performance modes) power the app, the main objective remained design-led: creating an expressive and communicative interaction experience.

