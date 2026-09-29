(async () => {
    await refreshSelectors(window.location.href);
    watchUrlChanges();
    startAutoSkip();
    startAdMarkerHiding();

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", startObserver, { once: true });
    } else {
        startObserver();
    }
})();