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
  'Suspend {name}?': 'إيقاف {name}؟',

  // Enums, as rendered lower-case (stuck reasons)
  unassigned: 'بلا سائق',
  unanswered: 'بلا رد من المطعم',
  'delivering too long': 'التوصيل يستغرق وقتًا طويلًا',

  // Dashboard
  'Platform dashboard': 'لوحة تحكم المنصة',
  'Loading statistics': 'جارٍ تحميل الإحصاءات',
  'Needs attention': 'يحتاج إلى متابعة',
  'Welcome, {name}': 'مرحباً، {name}',
  'Restaurants awaiting approval': 'مطاعم بانتظار الموافقة',
  'Drivers awaiting approval': 'سائقون بانتظار الموافقة',
  'Orders waiting for a driver': 'طلبات بانتظار سائق',
  'Orders stuck': 'طلبات متعثرة',
  'Nothing needs attention right now': 'لا يوجد ما يحتاج إلى متابعة الآن',
  '{count} restaurant(s) awaiting approval': 'مطاعم بانتظار الموافقة: {count}',
  '{count} driver(s) awaiting approval': 'سائقون بانتظار الموافقة: {count}',
  '{count} order(s) waiting for a driver': 'طلبات بانتظار سائق: {count}',
  '{count} stuck order(s)': 'طلبات متعثرة: {count}',
  'GMV today': 'إجمالي المبيعات اليوم',
  'Delivered orders only': 'الطلبات المسلّمة فقط',
  'Active restaurants': 'المطاعم النشطة',
  'Drivers on delivery': 'سائقون في توصيل',
  'Orders by status': 'الطلبات حسب الحالة',
  'Average delivery time': 'متوسط مدة التوصيل',
  'not enough data': 'لا توجد بيانات كافية',
  minutes: 'دقيقة',
  'Top restaurants (30 days)': 'أفضل المطاعم (30 يومًا)',
  'No delivered orders in the last 30 days.': 'لا توجد طلبات مسلّمة خلال آخر 30 يومًا.',

  // Users
  'Search by name or email': 'ابحث بالاسم أو البريد الإلكتروني',
  'Search by restaurant name': 'ابحث باسم المطعم',
  'Search by restaurant, customer or comment': 'ابحث بالمطعم أو العميل أو التعليق',
  'Search by order, restaurant or customer': 'ابحث برقم الطلب أو المطعم أو العميل',
  Role: 'الدور',
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
  Review: 'مراجعة',
  'The restaurant disappears from customer listings immediately. Orders already in progress will still complete.':
    'سيختفي المطعم من قوائم العملاء فورًا. ستكتمل الطلبات الجارية كالمعتاد.',
  'Suspend restaurant': 'إيقاف المطعم',
  '{name} approved and now visible to customers': 'تمت الموافقة على {name} وأصبح ظاهرًا للعملاء',
  'Restaurant updated': 'تم تحديث المطعم',
  'Restaurant reactivated': 'تمت إعادة تفعيل المطعم',

  // Drivers
  'Loading drivers': 'جارٍ تحميل السائقين',
  'No drivers match this filter': 'لا يوجد سائقون مطابقون لهذا المرشح',
  'No drivers are awaiting approval': 'لا يوجد سائقون بانتظار الموافقة',
  'Add a driver': 'إضافة سائق',
  'Add a customer': 'إضافة عميل',
  'Add an admin': 'إضافة مسؤول',
  'Add a restaurant': 'إضافة مطعم',
  'Create customer': 'إنشاء عميل',
  'Create admin': 'إنشاء مسؤول',
  'Create restaurant': 'إنشاء مطعم',
  'Back to customers': 'العودة إلى العملاء',
  'Back to admins': 'العودة إلى المسؤولين',
  'Back to restaurants': 'العودة إلى المطاعم',
  'Owner name': 'اسم المالك',
  'The owner gets an account and the restaurant starts awaiting approval, like any new restaurant.': 'يحصل المالك على حساب، ويبدأ المطعم بانتظار الموافقة مثل أي مطعم جديد.',
  'Give these details to the account holder now. The password is shown only once and cannot be retrieved later.': 'سلّم هذه البيانات لصاحب الحساب الآن. كلمة المرور تظهر مرة واحدة فقط ولا يمكن استرجاعها لاحقاً.',
  'All drivers': 'كل السائقين',
  'Back to drivers': 'العودة إلى السائقين',
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
  'This will cancel order {orderNumber}, release any assigned driver, and notify the customer. It cannot be undone.':
    'سيؤدي هذا إلى إلغاء الطلب {orderNumber} وتحرير أي سائق معيّن وإشعار العميل. لا يمكن التراجع عن ذلك.',
  'Order cancelled': 'تم إلغاء الطلب',

  // Make an order
  'Make an order': 'إنشاء طلب',
  "Place an order on a customer's behalf. It is paid cash on delivery and their cart is left as it is.":
    'أنشئ طلبًا نيابةً عن عميل. يُدفع نقدًا عند الاستلام ولا تتغير سلة العميل.',
  'Order {orderNumber} placed': 'تم إنشاء الطلب {orderNumber}',
  'Searching…': 'جارٍ البحث…',
  'No active customer matches.': 'لا يوجد عميل نشط مطابق.',
  'This customer has no saved addresses, so an order cannot be placed for them yet.':
    'لا توجد عناوين محفوظة لهذا العميل، لذا لا يمكن إنشاء طلب له بعد.',
  'No restaurant taking orders matches.': 'لا يوجد مطعم يستقبل الطلبات مطابق.',
  'Remove one {name}': 'إزالة واحد من {name}',
  'Add one {name}': 'إضافة واحد من {name}',
  'No dishes yet.': 'لم تتم إضافة أطباق بعد.',
  '{count} items. Tax, delivery and the total are calculated when the order is placed.':
    '{count} عنصر. تُحسب الضريبة والتوصيل والإجمالي عند إنشاء الطلب.',
  'Choose a customer.': 'اختر عميلًا.',
  'Choose a restaurant.': 'اختر مطعمًا.',
  'Add at least one dish.': 'أضف طبقًا واحدًا على الأقل.',

  // Add a customer: optional first address
  'Delivery address (optional)': 'عنوان التوصيل (اختياري)',
  'Fill in at least the street and city to save it as their default address.':
    'أدخل الشارع والمدينة على الأقل ليُحفظ كعنوانه الافتراضي.',

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

  // Admin restructure: per-role pages, deletion and restore
  Customers: 'العملاء',
  Admins: 'المشرفون',
  Deleted: 'محذوف',
  Delete: 'حذف',
  Queues: 'قوائم الانتظار',
  'Loading customers': 'جارٍ تحميل العملاء',
  'Loading admins': 'جارٍ تحميل المشرفين',
  'No customers match these filters': 'لا يوجد عملاء يطابقون هذه الفلاتر',
  'No admins match these filters': 'لا يوجد مشرفون يطابقون هذه الفلاتر',
  'Delete {name}?': 'حذف {name}؟',
  'Delete account': 'حذف الحساب',
  'Delete restaurant': 'حذف المطعم',
  'Delete driver': 'حذف السائق',
  '{name} deleted': 'تم حذف {name}',
  '{name} restored': 'تمت استعادة {name}',
  'They will no longer be able to sign in until restored. Their past orders and reviews are kept.':
    'لن يتمكن من تسجيل الدخول حتى تتم استعادته. تبقى طلباته وتقييماته السابقة محفوظة.',
  'The restaurant disappears from customers, and the owner’s account is deleted with it. Past orders and reviews are kept, and both can be restored.':
    'يختفي المطعم عن العملاء ويُحذف حساب مالكه معه. تبقى الطلبات والتقييمات السابقة محفوظة، ويمكن استعادة الاثنين.',

  // Row details popup
  Close: 'إغلاق',
  'Loading details': 'جارٍ تحميل التفاصيل',
  'Last sign-in': 'آخر تسجيل دخول',
  Never: 'أبدًا',
  'Deleted on': 'تاريخ الحذف',
  'Rejection reason': 'سبب الرفض',
  'Accepting orders': 'يستقبل الطلبات',
  Yes: 'نعم',
  No: 'لا',
  'Available items': 'الأصناف المتاحة',
  Owner: 'المالك',
  'Owner email': 'بريد المالك',
  'Approved on': 'تاريخ الموافقة',
  'Customer email': 'بريد العميل',
  'Customer phone': 'هاتف العميل',
  'Customer note': 'ملاحظة العميل',
  'Cancellation reason': 'سبب الإلغاء',
  'Order {orderNumber}': 'الطلب {orderNumber}',
  'cash on delivery': 'الدفع عند الاستلام',

  // Dashboard: live tiles, activity feed, leaderboards
  'In progress now': 'قيد التنفيذ الآن',
  'Delivered today': 'تم توصيلها اليوم',
  'Cancelled today': 'أُلغيت اليوم',
  'New customers today': 'عملاء جدد اليوم',
  'Reviews today': 'تقييمات اليوم',
  'Live activity': 'النشاط المباشر',
  'Updated {time}': 'آخر تحديث {time}',
  'New account': 'حساب جديد',
  '{name} reviewed {restaurant}': '{name} قيّم {restaurant}',
  'Nothing has happened yet.': 'لا يوجد نشاط بعد.',
  Platform: 'المنصة',
  'Active drivers': 'السائقون النشطون',
  'GMV (30 days)': 'إجمالي المبيعات (30 يومًا)',
  'Average rating (30 days)': 'متوسط التقييم (30 يومًا)',
  'Top drivers (30 days)': 'أفضل السائقين (30 يومًا)',
  '{count} deliveries': '{count} توصيلة',
  'Top customers (30 days)': 'أفضل العملاء (30 يومًا)',
  'Top rated restaurants': 'المطاعم الأعلى تقييمًا',
  'Not enough reviews yet.': 'لا توجد تقييمات كافية بعد.',
  'Top items (30 days)': 'الأصناف الأكثر طلبًا (30 يومًا)',

  // Reviews table
  Comment: 'التعليق',
  Date: 'التاريخ',

  // Review details popup
  'Restaurant rating': 'تقييم المطعم',
  'Driver rating': 'تقييم السائق',
  'Hidden by': 'أخفاه',
  Reason: 'السبب',
};
