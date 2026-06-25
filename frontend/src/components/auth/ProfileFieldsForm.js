import { GENDER_OPTIONS } from '../../utils/profileFields';

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-200';

const labelClass = 'block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5';

export default function ProfileFieldsForm({
  values,
  onChange,
  showEmail = false,
  showPassword = false,
  disabled = false,
}) {
  const set = (key) => (e) => onChange({ ...values, [key]: e.target.value });

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {showEmail && (
        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor="profile-email">Email</label>
          <input
            id="profile-email"
            type="email"
            autoComplete="email"
            required
            disabled={disabled}
            className={inputClass}
            value={values.email}
            onChange={set('email')}
          />
        </div>
      )}
      {showPassword && (
        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor="profile-password">Password</label>
          <input
            id="profile-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            disabled={disabled}
            className={inputClass}
            value={values.password}
            onChange={set('password')}
          />
          <p className="mt-1 text-xs text-slate-500">At least 8 characters.</p>
        </div>
      )}
      <div>
        <label className={labelClass} htmlFor="profile-first-name">First name</label>
        <input
          id="profile-first-name"
          type="text"
          autoComplete="given-name"
          required
          disabled={disabled}
          className={inputClass}
          value={values.firstName}
          onChange={set('firstName')}
        />
      </div>
      <div>
        <label className={labelClass} htmlFor="profile-last-name">Last name</label>
        <input
          id="profile-last-name"
          type="text"
          autoComplete="family-name"
          required
          disabled={disabled}
          className={inputClass}
          value={values.lastName}
          onChange={set('lastName')}
        />
      </div>
      <div>
        <label className={labelClass} htmlFor="profile-dob">Date of birth</label>
        <input
          id="profile-dob"
          type="date"
          required
          disabled={disabled}
          className={inputClass}
          value={values.dateOfBirth}
          onChange={set('dateOfBirth')}
        />
      </div>
      <div>
        <label className={labelClass} htmlFor="profile-phone">Phone number</label>
        <input
          id="profile-phone"
          type="tel"
          autoComplete="tel"
          required
          disabled={disabled}
          className={inputClass}
          placeholder="+92 300 1234567"
          value={values.phoneNumber}
          onChange={set('phoneNumber')}
        />
      </div>
      <div className="sm:col-span-2">
        <label className={labelClass} htmlFor="profile-gender">Gender</label>
        <select
          id="profile-gender"
          required
          disabled={disabled}
          className={inputClass}
          value={values.gender}
          onChange={set('gender')}
        >
          <option value="">Select gender</option>
          {GENDER_OPTIONS.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
