function hashParams() {
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash) return null;
  return new URLSearchParams(hash);
}

export function parseAuthHashParams() {
  const params = hashParams();
  if (!params) return null;

  const error = params.get('error');
  if (!error) return null;

  return {
    error,
    errorCode: params.get('error_code'),
    errorDescription: params.get('error_description'),
  };
}

export function hasAuthHashSession() {
  const params = hashParams();
  if (!params) return false;
  return Boolean(params.get('access_token') || params.get('refresh_token') || params.get('type'));
}

export function clearAuthHash() {
  if (!window.location.hash) return;
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
}

export function formatAuthError({ errorCode, errorDescription } = {}) {
  if (errorCode === 'otp_expired') {
    return 'This confirmation link has expired. Enter your email below and click “Resend confirmation email”.';
  }
  if (errorDescription) {
    return decodeURIComponent(errorDescription.replace(/\+/g, ' '));
  }
  return 'Could not complete sign-in. Please try again.';
}
