export function isStandaloneDisplay() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches
    || window.matchMedia('(display-mode: fullscreen)').matches
    || window.navigator.standalone === true
  );
}

export function isMobilePhone() {
  if (typeof window === 'undefined') return false;
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
  const narrow = window.matchMedia('(max-width: 768px)').matches;
  const mobileUa = /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  return (narrow && coarsePointer) || mobileUa;
}

export function isIosSafari() {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent;
  const isAppleMobile = /iPhone|iPad|iPod/i.test(ua);
  const isSafari = /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);
  return isAppleMobile && isSafari;
}

export function isAndroidChrome() {
  if (typeof window === 'undefined') return false;
  return /Android/i.test(navigator.userAgent) && /Chrome/i.test(navigator.userAgent);
}
