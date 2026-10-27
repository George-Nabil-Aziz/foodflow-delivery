/**
 * Arabic catalogue: discount codes - the cart and checkout field, the admin
 * list and form, and the API's discount messages.
 */
export default {
  // Cart, checkout and order summaries
  Discount: 'الخصم',
  'Discount ({code})': 'الخصم ({code})',
  'Discount code': 'كود الخصم',
  'Discount code (optional)': 'كود الخصم (اختياري)',
  Apply: 'تطبيق',
  'Enter a discount code.': 'أدخل كود الخصم.',
  'Discount code {code} applied': 'تم تطبيق كود الخصم {code}',
  'you save {amount}': 'توفّر {amount}',
  'Remove code': 'إزالة الكود',
  'Remove the discount code above or choose another to place your order.':
    'أزل كود الخصم أعلاه أو اختر كودًا آخر لإتمام طلبك.',

  // Why a code was refused
  'This discount code is not valid.': 'كود الخصم هذا غير صالح.',
  'This discount code is not active yet.': 'كود الخصم هذا غير مفعّل بعد.',
  'This discount code has expired.': 'انتهت صلاحية كود الخصم هذا.',
  'Add {amount} more to use this code (minimum {required}).':
    'أضف {amount} أخرى لاستخدام هذا الكود (الحد الأدنى {required}).',
  'This discount code is for a different restaurant.': 'كود الخصم هذا لمطعم آخر.',
  'This discount code has reached its usage limit.': 'استُنفد عدد مرات استخدام كود الخصم هذا.',
  'You have already used this discount code the maximum number of times.':
    'لقد استخدمت كود الخصم هذا الحد الأقصى من المرات.',
  'This discount code is not valid at this time.': 'كود الخصم هذا غير صالح في هذا الوقت.',
  'This discount code cannot be used on this order.': 'لا يمكن استخدام كود الخصم هذا على هذا الطلب.',
  'A discount code with this name already exists.': 'يوجد كود خصم بهذا الاسم بالفعل.',

  // Admin list
  'Discount codes': 'أكواد الخصم',
  'Add a discount code': 'إضافة كود خصم',
  'Search by code or description': 'ابحث بالكود أو الوصف',
  'Loading discount codes': 'جارٍ تحميل أكواد الخصم',
  'No discount codes match these filters': 'لا توجد أكواد خصم تطابق عوامل التصفية',
  Code: 'الكود',
  'Applies to': 'ينطبق على',
  'All restaurants': 'كل المطاعم',
  Used: 'الاستخدام',
  'Total discount given': 'إجمالي الخصم الممنوح',
  Inactive: 'غير نشط',
  Expired: 'منتهٍ',
  Scheduled: 'مجدول',
  Deactivate: 'إلغاء التفعيل',
  '{amount} off': 'خصم {amount}',
  '{percent}% off': 'خصم {percent}%',
  'up to {amount}': 'حتى {amount}',
  '{used} of {limit}': '{used} من {limit}',
  Always: 'دائمًا',
  Valid: 'الصلاحية',
  'Minimum subtotal': 'الحد الأدنى للمجموع الفرعي',
  'Times used': 'عدد مرات الاستخدام',
  'Limit per customer': 'الحد لكل عميل',
  'No limit': 'بلا حد',
  Created: 'تاريخ الإنشاء',
  'Deactivate {code}?': 'إلغاء تفعيل {code}؟',
  'Delete {code}?': 'حذف {code}؟',
  'Deactivate code': 'إلغاء تفعيل الكود',
  'Delete code': 'حذف الكود',
  'Customers can no longer use this code, including carts that already have it applied. Orders already placed keep their discount.':
    'لن يتمكن العملاء من استخدام هذا الكود، بما في ذلك السلال المطبَّق عليها. تحتفظ الطلبات المقدّمة بخصمها.',
  'The code disappears from this list and can no longer be used. Orders already placed keep their discount.':
    'يختفي الكود من هذه القائمة ولا يمكن استخدامه بعد الآن. تحتفظ الطلبات المقدّمة بخصمها.',
  '{code} deactivated': 'تم إلغاء تفعيل {code}',
  '{code} reactivated': 'تمت إعادة تفعيل {code}',
  '{code} deleted': 'تم حذف {code}',
  '{code} created': 'تم إنشاء {code}',
  '{code} updated': 'تم تحديث {code}',

  // Admin form
  'Edit discount code': 'تعديل كود الخصم',
  'Orders already placed keep the discount they were given, whatever you change here.':
    'تحتفظ الطلبات المقدّمة بالخصم الذي حصلت عليه مهما غيّرت هنا.',
  'Description (optional)': 'الوصف (اختياري)',
  Type: 'النوع',
  'Percentage of the subtotal': 'نسبة من المجموع الفرعي',
  'Fixed amount': 'مبلغ ثابت',
  Percentage: 'النسبة',
  Amount: 'المبلغ',
  'Maximum discount (optional)': 'الحد الأقصى للخصم (اختياري)',
  'Caps what a percentage can take off one order.': 'يحدد أقصى ما تخصمه النسبة من طلب واحد.',
  'Minimum subtotal (optional)': 'الحد الأدنى للمجموع الفرعي (اختياري)',
  'Judged on the items total, before the discount.': 'يُحتسب على مجموع الأصناف قبل الخصم.',
  'Starts (optional)': 'يبدأ (اختياري)',
  'Ends (optional)': 'ينتهي (اختياري)',
  'Total uses (optional)': 'إجمالي الاستخدامات (اختياري)',
  'Uses per customer (optional)': 'الاستخدامات لكل عميل (اختياري)',
  'Leave empty for no limit.': 'اتركه فارغًا لعدم تحديد حد.',
  'A code cannot be renamed.': 'لا يمكن تغيير اسم الكود.',
  'Customers type this at checkout. Letters, digits, dashes and underscores; not case-sensitive.':
    'يكتبه العملاء عند إتمام الطلب. أحرف وأرقام وشرطات؛ لا يميّز بين الأحرف الكبيرة والصغيرة.',
  'Create discount code': 'إنشاء كود الخصم',
  'Back to discount codes': 'العودة إلى أكواد الخصم',
  'Use 3-30 letters, digits, dashes or underscores': 'استخدم من 3 إلى 30 حرفًا أو رقمًا أو شرطة',
  'A percentage cannot be more than 100': 'لا يمكن أن تزيد النسبة على 100',
  'Cannot be negative': 'لا يمكن أن تكون سالبة',
  'Enter a whole number of at least 1': 'أدخل عددًا صحيحًا لا يقل عن 1',
  'The end must be after the start': 'يجب أن يكون الانتهاء بعد البدء',
  'Value is required': 'القيمة مطلوبة',
  'Code is required': 'الكود مطلوب',
};
