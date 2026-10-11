/**
 * Arabic catalogue: the driver area (dashboard, offers, active delivery,
 * history, profile) and the driver enums it renders (availability, vehicle).
 */
export default {
  // Enums, as rendered lower-case ("on delivery", "motorcycle")
  available: 'متاح',
  offline: 'غير متصل',
  'on delivery': 'في توصيل',
  bicycle: 'دراجة هوائية',
  motorcycle: 'دراجة نارية',
  car: 'سيارة',

  // Dashboard
  'Driver dashboard': 'لوحة تحكم السائق',
  'Account {status}': 'الحساب {status}',
  'On a delivery': 'في مهمة توصيل',
  'Online and available': 'متصل ومتاح',
  Offline: 'غير متصل',
  'An administrator must approve your account before you can take deliveries.':
    'يجب أن يوافق مسؤول على حسابك قبل أن تتمكن من استلام التوصيلات.',
  'Finish your current delivery before going offline.': 'أكمل التوصيل الحالي قبل قطع الاتصال.',
  'You will receive delivery offers.': 'ستصلك عروض التوصيل.',
  'Go online to start receiving offers.': 'اتصل لتبدأ في استلام العروض.',
  'You cannot go offline during an active delivery': 'لا يمكنك قطع الاتصال أثناء توصيل جارٍ',
  'Go offline': 'قطع الاتصال',
  'Go online': 'اتصال',
  'You cannot go offline while a delivery is in progress.': 'لا يمكنك قطع الاتصال أثناء وجود توصيل قيد التنفيذ.',
  'You are online': 'أنت متصل الآن',
  'You are offline': 'أنت غير متصل الآن',
  'Active deliveries': 'التوصيلات الجارية',
  Vehicle: 'المركبة',
  'Current delivery': 'التوصيل الحالي',
  'No active delivery': 'لا يوجد توصيل جارٍ',
  'Accept an offer to start delivering.': 'اقبل عرضًا لتبدأ التوصيل.',
  'See available offers': 'عرض العروض المتاحة',

  // Offers
  'Delivery offers': 'عروض التوصيل',
  'Offers expire automatically. You see the distance and area before accepting.':
    'تنتهي صلاحية العروض تلقائيًا. ترى المسافة والمنطقة قبل القبول.',
  'Loading offers': 'جارٍ تحميل العروض',
  'No offers right now': 'لا توجد عروض حاليًا',
  'Stay online and new offers will appear here automatically.': 'ابقَ متصلًا وستظهر العروض الجديدة هنا تلقائيًا.',
  'Pick up: {address}': 'الاستلام: {address}',
  'Drop off: {area}': 'التسليم: {area}',
  '{distance} km away': 'على بُعد {distance} كم',
  'This offer expired': 'انتهت صلاحية هذا العرض',
  '{seconds}s left': 'متبقٍ {seconds} ث',
  Decline: 'رفض',
  Accept: 'قبول',
  'Delivery accepted': 'تم قبول التوصيل',
  'That offer is no longer available': 'هذا العرض لم يعد متاحًا',
  'Offer declined': 'تم رفض العرض',

  // Active delivery
  'Loading delivery': 'جارٍ تحميل التوصيل',
  'This order was cancelled': 'تم إلغاء هذا الطلب',
  'You are available for new offers again.': 'أصبحت متاحًا لعروض جديدة مرة أخرى.',
  'Head to the restaurant': 'توجّه إلى المطعم',
  'Picked up': 'تم الاستلام',
  'I have picked up the order': 'استلمت الطلب',
  'Mark as delivered': 'تأكيد التسليم',
  'Marked as picked up': 'تم تسجيل الاستلام',
  'Delivery complete': 'اكتمل التوصيل',
  'Pick up from': 'الاستلام من',
  'Deliver to': 'التوصيل إلى',
  'Order contents': 'محتويات الطلب',
  'Collect {amount} in cash': 'حصّل {amount} نقدًا',
  'Back to dashboard': 'العودة إلى لوحة التحكم',

  // History
  'Delivery history': 'سجل التوصيلات',
  'Loading history': 'جارٍ تحميل السجل',
  'No completed deliveries yet': 'لا توجد توصيلات مكتملة بعد',
  'Deliveries you finish will be listed here.': 'ستظهر هنا التوصيلات التي تكملها.',
  'Ratings you received': 'التقييمات التي حصلت عليها',

  // Profile
  'Driver profile': 'الملف الشخصي للسائق',
  'Account status': 'حالة الحساب',
  'Vehicle type': 'نوع المركبة',
  'Plate number': 'رقم اللوحة',
  Location: 'الموقع',
  'Sharing your location helps us offer you the nearest deliveries.':
    'مشاركة موقعك تساعدنا على عرض أقرب التوصيلات عليك.',
  'Update my location': 'تحديث موقعي',
  'Your browser does not support location sharing.': 'متصفحك لا يدعم مشاركة الموقع.',
  'Location updated': 'تم تحديث الموقع',
  'We could not read your location.': 'تعذّر تحديد موقعك.',
};
