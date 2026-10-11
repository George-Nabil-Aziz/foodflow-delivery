/**
 * Arabic catalogue: the admin area (platform dashboard, users, restaurants,
 * drivers, orders, review moderation).
 */
export default {
  // 'Active' as an account status; the bare key means the current orders tab.
  'status::Active': 'نشط',
  // Shared admin vocabulary
  Status: 'الحالة',
  'All statuses': 'كل الحالات',
  Actions: 'الإجراءات',
  Approve: 'موافقة',
  Suspend: 'إيقاف',
  Reactivate: 'إعادة تفعيل',
  unrated: 'بلا تقييم',
  'Awaiting approval ({count})': 'بانتظار الموافقة ({count})',
  'Suspend {name}?': 'إيقاف {name}؟',

  // Enums, as rendered lower-case (stuck reasons)
  unassigned: 'بلا سائق',
  unanswered: 'بلا رد من المطعم',
  'delivering too long': 'التوصيل يستغرق وقتًا طويلًا',

  // Dashboard
  'Platform dashboard': 'لوحة تحكم المنصة',
  'Loading statistics': 'جارٍ تحميل الإحصاءات',
  'Needs attention': 'يحتاج إلى متابعة',
  '{count} restaurant(s) awaiting approval': 'مطاعم بانتظار الموافقة: {count}',
  '{count} driver(s) awaiting approval': 'سائقون بانتظار الموافقة: {count}',
  '{count} order(s) waiting for a driver': 'طلبات بانتظار سائق: {count}',
  '{count} stuck order(s)': 'طلبات متعثرة: {count}',
  'GMV today': 'إجمالي المبيعات اليوم',
  'Delivered orders only': 'الطلبات المسلّمة فقط',
  'Active restaurants': 'المطاعم النشطة',
  'Drivers on delivery': 'سائقون في توصيل',
  'Orders by status': 'الطلبات حسب الحالة',
  'Average delivery time:': 'متوسط مدة التوصيل:',
  'not enough data': 'لا توجد بيانات كافية',
  minutes: 'دقيقة',
  'Top restaurants (30 days)': 'أفضل المطاعم (30 يومًا)',
  'No delivered orders in the last 30 days.': 'لا توجد طلبات مسلّمة خلال آخر 30 يومًا.',

  // Users
  'Name or email': 'الاسم أو البريد الإلكتروني',
  Role: 'الدور',
  'All roles': 'كل الأدوار',
  Joined: 'تاريخ الانضمام',
  'This is you': 'هذا أنت',
  'Loading users': 'جارٍ تحميل المستخدمين',
  'No users match these filters': 'لا يوجد مستخدمون مطابقون لهذه المرشحات',
  'This immediately ends every session for {email} and blocks their existing access token. They will not be able to sign in until reactivated.':
    'سيؤدي هذا فورًا إلى إنهاء جميع جلسات {email} وحظر رمز الوصول الحالي. لن يتمكن من تسجيل الدخول حتى يُعاد تفعيل حسابه.',
  'Suspend account': 'إيقاف الحساب',
  '{name} suspended': 'تم إيقاف {name}',
  '{name} reactivated': 'تمت إعادة تفعيل {name}',

  // Restaurants
  'No restaurants match this filter': 'لا توجد مطاعم مطابقة لهذا المرشح',
  'no city set': 'لم تُحدَّد المدينة',
  '{count} available item(s)': 'الأصناف المتاحة: {count}',
  'Owner: {name} ({email})': 'المالك: {name} ({email})',
  'Cannot be approved yet: a restaurant needs at least one available item.':
    'لا يمكن الموافقة بعد: يحتاج المطعم إلى صنف متاح واحد على الأقل.',
  'Reject {name}?': 'رفض {name}؟',
  'The owner will see your reason and can fix the problem and resubmit.':
    'سيرى المالك السبب ويمكنه إصلاح المشكلة وإعادة التقديم.',
  'Reject application': 'رفض الطلب',
  'All restaurants': 'كل المطاعم',
  'The restaurant disappears from customer listings immediately. Orders already in progress will still complete.':
    'سيختفي المطعم من قوائم العملاء فورًا. ستكتمل الطلبات الجارية كالمعتاد.',
  'Suspend restaurant': 'إيقاف المطعم',
  '{name} approved and now visible to customers': 'تمت الموافقة على {name} وأصبح ظاهرًا للعملاء',
  'Restaurant updated': 'تم تحديث المطعم',
  'Restaurant reactivated': 'تمت إعادة تفعيل المطعم',

  // Drivers
  'Loading drivers': 'جارٍ تحميل السائقين',
  'No drivers match this filter': 'لا يوجد سائقون مطابقون لهذا المرشح',
  'Add a driver': 'إضافة سائق',
  "Drivers cannot sign themselves up: they receive customers' home addresses, so every account is created here and approved separately.":
    'لا يمكن للسائقين التسجيل بأنفسهم: فهم يطّلعون على عناوين منازل العملاء، لذا يُنشأ كل حساب هنا ويُوافَق عليه بشكل منفصل.',
  'Account created': 'تم إنشاء الحساب',
  'Give these details to the driver now. The password is shown only once and cannot be retrieved later.':
    'سلّم هذه البيانات للسائق الآن. تظهر كلمة المرور مرة واحدة فقط ولا يمكن استرجاعها لاحقًا.',
  'I have saved it': 'لقد حفظتها',
  'Full name': 'الاسم الكامل',
  'Create driver': 'إنشاء سائق',
  'Driver account created': 'تم إنشاء حساب السائق',
  '{name} approved': 'تمت الموافقة على {name}',
  'A driver who is currently on a delivery cannot be suspended: the order is already in their vehicle.':
    'لا يمكن إيقاف سائق في مهمة توصيل حاليًا: فالطلب موجود بالفعل في مركبته.',
  'Suspend driver': 'إيقاف السائق',
  'Driver suspended': 'تم إيقاف السائق',

  // Orders
  'All orders': 'كل الطلبات',
  'Waiting for a driver': 'بانتظار سائق',
  Stuck: 'متعثرة',
  'Filter by status': 'التصفية حسب الحالة',
  'Nothing is stuck': 'لا توجد طلبات متعثرة',
  'No orders match this view': 'لا توجد طلبات في هذا العرض',
  'Every confirmed order has a driver or an active offer.': 'لكل طلب مؤكد سائق أو عرض قائم.',
  Order: 'الطلب',
  Placed: 'وقت الطلب',
  'no driver yet': 'لا يوجد سائق بعد',
  'Force-cancel': 'إلغاء إجباري',
  'Force-cancel this order?': 'إلغاء هذا الطلب إجباريًا؟',
  'This will cancel order {orderNumber}, release any assigned driver, and notify the customer. It cannot be undone.':
    'سيؤدي هذا إلى إلغاء الطلب {orderNumber} وتحرير أي سائق معيّن وإشعار العميل. لا يمكن التراجع عن ذلك.',
  'Force-cancel order': 'إلغاء الطلب إجباريًا',
  'Order cancelled': 'تم إلغاء الطلب',

  // Reviews
  'Review moderation': 'إدارة التقييمات',
  'All reviews': 'كل التقييمات',
  Published: 'منشور',
  'No reviews match this filter': 'لا توجد تقييمات مطابقة لهذا المرشح',
  'Hidden because: {reason}': 'أُخفي بسبب: {reason}',
  Hide: 'إخفاء',
  Restore: 'استعادة',
  'Hide this review?': 'إخفاء هذا التقييم؟',
  "It will be removed from {restaurant}'s public page and excluded from their rating average. You can restore it later.":
    'سيُزال من الصفحة العامة لمطعم {restaurant} ويُستبعد من متوسط تقييمه. يمكنك استعادته لاحقًا.',
  'Hide review': 'إخفاء التقييم',
  'Review hidden and rating recalculated': 'تم إخفاء التقييم وإعادة حساب المتوسط',
  'Review restored and rating recalculated': 'تمت استعادة التقييم وإعادة حساب المتوسط',
};
