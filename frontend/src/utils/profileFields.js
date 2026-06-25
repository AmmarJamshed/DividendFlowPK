export const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

export function isProfileComplete(profile) {
  if (!profile) return false;
  return Boolean(
    profile.profile_complete
    || (
      String(profile.first_name || '').trim()
      && String(profile.last_name || '').trim()
      && profile.date_of_birth
      && String(profile.phone_number || '').trim()
      && profile.gender
    )
  );
}

export function isProfileCompleteFromMetadata(user) {
  if (!user) return false;
  const meta = namesFromUserMetadata(user);
  return Boolean(
    meta.firstName
    && meta.lastName
    && meta.dateOfBirth
    && meta.phone
    && GENDER_OPTIONS.some((option) => option.value === meta.gender)
  );
}

export function isUserProfileComplete(profile, user) {
  return isProfileComplete(profile) || isProfileCompleteFromMetadata(user);
}

export function namesFromUserMetadata(user) {
  const meta = user?.user_metadata || {};
  let firstName = meta.first_name || '';
  let lastName = meta.last_name || '';
  const full = meta.full_name || meta.name || '';
  if (!firstName && full) {
    const parts = full.trim().split(/\s+/);
    firstName = parts[0] || '';
    lastName = parts.slice(1).join(' ') || '';
  }
  return {
    firstName: String(firstName).trim(),
    lastName: String(lastName).trim(),
    phone: String(meta.phone_number || meta.phone || '').trim(),
    dateOfBirth: meta.date_of_birth || meta.birthday || '',
    gender: meta.gender || '',
  };
}
