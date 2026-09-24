"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import "lenis/dist/lenis.css";

/** Motion enhances the server-rendered story; every section works without it. */
export default function LandingMotion() {
  useEffect(() => {
    const menu = document.querySelector<HTMLDetailsElement>(".lp-mobile-nav");
    const closeMenu = (event: Event) => {
      if ((event.target as Element).closest("a") && menu) menu.open = false;
    };
    menu?.addEventListener("click", closeMenu);
    gsap.registerPlugin(ScrollTrigger);
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      const lenis = new Lenis({
        anchors: { offset: -96 },
        lerp: 0.085,
        syncTouch: false,
      });
      const tick = (time: number) => lenis.raf(time * 1000);
      lenis.on("scroll", ScrollTrigger.update);
      gsap.ticker.add(tick);
      gsap.utils
        .toArray<HTMLElement>(".landing [data-reveal]")
        .forEach((element) => {
          gsap.from(element, {
            y: 32,
            opacity: 0,
            duration: 0.85,
            ease: "power3.out",
            scrollTrigger: { trigger: element, start: "top 92%", once: true },
          });
        });
      gsap.to(".lp-progress", {
        scaleX: 1,
        ease: "none",
        scrollTrigger: { start: 0, end: "max", scrub: 0.2 },
      });
      const desktop = gsap.matchMedia();
      desktop.add("(min-width: 960px)", () => {
        gsap.to(".lp-hero-visual", {
          y: -36,
          rotate: 0,
          ease: "none",
          scrollTrigger: {
            trigger: ".lp-hero",
            start: "top top",
            end: "bottom top",
            scrub: 0.8,
          },
        });
        gsap.utils.toArray<HTMLElement>(".lp-story-step").forEach((step, i) => {
          ScrollTrigger.create({
            trigger: step,
            start: "top 58%",
            end: "bottom 58%",
            onToggle: ({ isActive }) => {
              if (!isActive) return;
              document
                .querySelector(".lp-story-display")
                ?.setAttribute("data-step", String(i));
            },
          });
        });
      });
      let active = true;
      document.fonts.ready.then(() => {
        if (active) ScrollTrigger.refresh();
      });
      return () => {
        active = false;
        desktop.revert();
        gsap.ticker.remove(tick);
        lenis.destroy();
        document
          .querySelector(".lp-story-display")
          ?.removeAttribute("data-step");
      };
    });
    return () => {
      menu?.removeEventListener("click", closeMenu);
      media.revert();
    };
  }, []);
  return null;
}
