(async () => {
    // Тогл в popup выключает DNR и вставку CSS. Content scripts
    // при этом продолжают выполняться, если их не остановить здесь:
    // text-based hiding и observer работают независимо от enabled.
    const { enabled = true } = await chrome.storage.local.get("enabled");
    if (!enabled) return;

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
