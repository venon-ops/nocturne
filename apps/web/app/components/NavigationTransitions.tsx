"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function NavigationTransitions() {
  const router = useRouter();

  useEffect(() => {
    const internalUrl = (target: EventTarget | null) => {
      const anchor = (target as Element | null)?.closest<HTMLAnchorElement>(
        "a[href]",
      );
      if (!anchor || anchor.target || anchor.download) return null;
      const url = new URL(anchor.href, location.href);
      return url.origin === location.origin ? url : null;
    };

    const prefetch = (event: Event) => {
      const url = internalUrl(event.target);
      if (url) router.prefetch(url.pathname + url.search);
    };

    const navigate = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const anchor = (event.target as Element).closest<HTMLAnchorElement>(
        "a[href]",
      );
      const url = internalUrl(event.target);
      if (
        !anchor ||
        !url ||
        anchor.dataset.noTransition !== undefined ||
        (url.pathname === location.pathname && url.search === location.search) ||
        (url.hash && url.pathname === location.pathname)
      )
        return;

      event.preventDefault();
      const destination = url.pathname + url.search + url.hash;
      if (
        document.startViewTransition &&
        !matchMedia("(prefers-reduced-motion: reduce)").matches
      )
        document.startViewTransition(() => router.push(destination));
      else router.push(destination);
    };

    document.addEventListener("pointerover", prefetch, { passive: true });
    document.addEventListener("touchstart", prefetch, { passive: true });
    document.addEventListener("click", navigate);
    return () => {
      document.removeEventListener("pointerover", prefetch);
      document.removeEventListener("touchstart", prefetch);
      document.removeEventListener("click", navigate);
    };
  }, [router]);

  return null;
}

