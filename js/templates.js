// قوالب جاهزة لأشياء البيت الشائعة ومدد تغييرها المعتادة
export const TEMPLATES = [
  { name: 'فلتر ماء الشرب', emoji: '💧', room: 'المطبخ', every: { n: 6, unit: 'm' } },
  { name: 'غشاء فلتر الماء (RO)', emoji: '🚰', room: 'المطبخ', every: { n: 2, unit: 'y' } },
  { name: 'فلتر المكيف', emoji: '❄️', room: 'الصالة', every: { n: 3, unit: 'm' } },
  { name: 'صيانة المكيفات', emoji: '🌀', room: 'البيت', every: { n: 1, unit: 'y' } },
  { name: 'بطارية كاشف الدخان', emoji: '🔋', room: 'البيت', every: { n: 1, unit: 'y' } },
  { name: 'طفاية الحريق', emoji: '🧯', room: 'المطبخ', every: { n: 1, unit: 'y' } },
  { name: 'فرشاة الأسنان', emoji: '🪥', room: 'دورة المياه', every: { n: 3, unit: 'm' } },
  { name: 'المخدات', emoji: '🛏️', room: 'غرفة النوم', every: { n: 2, unit: 'y' } },
  { name: 'المرتبة', emoji: '🛌', room: 'غرفة النوم', every: { n: 8, unit: 'y' } },
  { name: 'فلتر شفاط المطبخ', emoji: '🍳', room: 'المطبخ', every: { n: 6, unit: 'm' } },
  { name: 'فلتر الثلاجة', emoji: '🧊', room: 'المطبخ', every: { n: 6, unit: 'm' } },
  { name: 'تنظيف سخان الماء', emoji: '🔥', room: 'السطح', every: { n: 1, unit: 'y' } },
  { name: 'رأس الدش', emoji: '🚿', room: 'دورة المياه', every: { n: 1, unit: 'y' } },
  { name: 'زيت السيارة', emoji: '🛢️', room: 'السيارة', every: { n: 6, unit: 'm' } },
  { name: 'بطارية السيارة', emoji: '🔋', room: 'السيارة', every: { n: 2, unit: 'y' } },
  { name: 'كفرات السيارة', emoji: '🛞', room: 'السيارة', every: { n: 3, unit: 'y' } },
  { name: 'تأمين السيارة', emoji: '🛡️', room: 'السيارة', every: { n: 1, unit: 'y' } },
];

export const ROOMS = ['المطبخ', 'الصالة', 'غرفة النوم', 'دورة المياه', 'المجلس', 'السطح', 'الحوش', 'السيارة', 'البيت'];

export const EMOJIS = ['💧', '🚰', '❄️', '🌀', '🔥', '🪥', '🛏️', '🛌', '🛋️', '🧽', '🧴', '🧼', '🔋', '💡', '🔌',
  '🚗', '🛞', '🛢️', '🧯', '🚿', '🚽', '🍳', '🧊', '🪟', '🌿', '🐟', '🧹', '🧺', '📦', '🔧', '⚙️', '🩺',
  '💊', '👓', '🦷', '🏠', '🔑', '📄', '🪪', '🛡️', '👟', '🖨️', '💻', '📱', '🔁'];

export const REMIND_OPTIONS = [
  { d: 0, label: 'يوم الموعد' },
  { d: 1, label: 'قبل يوم' },
  { d: 3, label: 'قبل 3 أيام' },
  { d: 7, label: 'قبل أسبوع' },
  { d: 14, label: 'قبل أسبوعين' },
  { d: 30, label: 'قبل شهر' },
];
