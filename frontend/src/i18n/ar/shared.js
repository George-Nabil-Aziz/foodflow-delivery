/**
 * Arabic catalogue: shared form and dialog components, the public auth and
 * error pages, client-side validation messages, and the order-status labels
 * (cancellation reasons, cart issues) other areas render through t().
 */
export default {
  // ConfirmDialog
  'Reason (required)': 'السبب (مطلوب)',
  'Note (required)': 'ملاحظة (مطلوبة)',
  'Choose a reason': 'اختر سببًا',
  'Explain why, in at least 5 characters': 'اذكر السبب في 5 أحرف على الأقل',

  // StarRating
  '{n} star': '{n} نجمة',
  '{n} stars': '{n} نجوم',
  '{n} of 5': '{n} من 5',

  // DevAccounts
  'Development accounts': 'حسابات التطوير',
  'Click one to sign in. Shown in development only.': 'انقر على أحدها لتسجيل الدخول. تظهر في بيئة التطوير فقط.',

  // OrderTimeline
  'Order progress': 'مراحل الطلب',
  '(current step)': '(المرحلة الحالية)',

  // SwitchRestaurantDialog
  'Start a new cart?': 'هل تريد بدء سلة جديدة؟',
  'Your cart has': 'تحتوي سلتك على',
  'item(s) from': 'صنف من',
  'You can only order from one restaurant at a time.': 'يمكنك الطلب من مطعم واحد فقط في كل مرة.',
  'Starting a new cart with': 'بدء سلة جديدة من',
  'will remove the items you already added.': 'سيحذف الأصناف التي أضفتها.',
  'Keep my cart': 'الإبقاء على سلتي',
  'Start new cart': 'بدء سلة جديدة',

  // Login and register
  'Welcome back to FoodFlow.': 'أهلًا بعودتك إلى FoodFlow.',
  'New to FoodFlow?': 'جديد على FoodFlow؟',
  'Create your account': 'أنشئ حسابك',
  'I want to': 'أريد أن',
  'Order food': 'أطلب طعامًا',
  'Run a restaurant': 'أدير مطعمًا',
  'Create account': 'إنشاء حساب',
  'Already have an account?': 'لديك حساب بالفعل؟',
  Email: 'البريد الإلكتروني',
  Password: 'كلمة المرور',
  Phone: 'رقم الموبايل',
  'Your name': 'اسمك',
  'Restaurant name': 'اسم المطعم',
  'Your restaurant is reviewed by our team before customers can see it.':
    'يراجع فريقنا مطعمك قبل أن يظهر للعملاء.',
  'At least 8 characters, with a letter and a digit.': '8 أحرف على الأقل، تتضمن حرفًا ورقمًا.',

  // Forbidden and not found
  'You do not have access to this page': 'ليس لديك صلاحية الوصول إلى هذه الصفحة',
  'This area is for a different kind of account.': 'هذا القسم مخصص لنوع آخر من الحسابات.',
  'You are signed in as': 'أنت مسجّل الدخول بصفتك',
  'You are not signed in.': 'لم تسجّل الدخول.',
  'Go to my dashboard': 'الذهاب إلى لوحة التحكم',
  'Page not found': 'الصفحة غير موجودة',
  'We could not find that page. It may have moved.': 'تعذر العثور على هذه الصفحة. ربما نُقلت.',
  'Back to home': 'العودة إلى الرئيسية',

  // Role codes, as the auth store holds them
  ADMIN: 'مسؤول',
  CUSTOMER: 'عميل',
  RESTAURANT: 'مطعم',
  DRIVER: 'سائق',

  // Client-side validation (composables/useValidation.js), per caller label
  'This field is required': 'هذا الحقل مطلوب',
  'Name is required': 'الاسم مطلوب',
  'Email is required': 'البريد الإلكتروني مطلوب',
  'Phone is required': 'رقم الموبايل مطلوب',
  'Plate is required': 'رقم اللوحة مطلوب',
  'Street address is required': 'عنوان الشارع مطلوب',
  'City is required': 'المدينة مطلوبة',
  'Current password is required': 'كلمة المرور الحالية مطلوبة',
  'New password is required': 'كلمة المرور الجديدة مطلوبة',
  'Password is required': 'كلمة المرور مطلوبة',
  'Your name is required': 'اسمك مطلوب',
  'Restaurant name is required': 'اسم المطعم مطلوب',
  'Price is required': 'السعر مطلوب',
  'Category is required': 'التصنيف مطلوب',
  'Name must be at least 2 characters': 'يجب أن يتكون الاسم من حرفين على الأقل',
  'Plate must be at least 2 characters': 'يجب أن يتكون رقم اللوحة من حرفين على الأقل',
  'City must be at least 2 characters': 'يجب أن يتكون اسم المدينة من حرفين على الأقل',
  'Your name must be at least 2 characters': 'يجب أن يتكون اسمك من حرفين على الأقل',
  'Restaurant name must be at least 2 characters': 'يجب أن يتكون اسم المطعم من حرفين على الأقل',
  'Street address must be at least 5 characters': 'يجب أن يتكون عنوان الشارع من 5 أحرف على الأقل',
  'Name must be at most 60 characters': 'يجب ألا يزيد الاسم على 60 حرفًا',
  'Name must be at most 120 characters': 'يجب ألا يزيد الاسم على 120 حرفًا',
  'Enter a valid email address': 'أدخل بريدًا إلكترونيًا صحيحًا',
  'Must be at least 8 characters': 'يجب أن تتكون من 8 أحرف على الأقل',
  'Must be at most 72 characters': 'يجب ألا تزيد على 72 حرفًا',
  'Must contain at least one letter': 'يجب أن تحتوي على حرف واحد على الأقل',
  'Must contain at least one digit': 'يجب أن تحتوي على رقم واحد على الأقل',
  'Enter an Egyptian mobile number, for example 01012345678': 'أدخل رقم موبايل مصري، مثل 01012345678',
  'Enter an amount with at most 2 decimals': 'أدخل مبلغًا بخانتين عشريتين كحد أقصى',
  'Must be greater than 0': 'يجب أن يكون أكبر من 0',
  'Must be at most 9999.99': 'يجب ألا يزيد على 9999.99',
  'Choose a rating from 1 to 5': 'اختر تقييمًا من 1 إلى 5',

  // Client-side error fallbacks (useFormErrors.js, services/http.js)
  'Invalid value': 'قيمة غير صالحة',
  'Request failed': 'فشل الطلب',
  'We could not reach FoodFlow. Check your connection and try again.':
    'تعذر الاتصال بـ FoodFlow. تحقق من اتصالك وحاول مرة أخرى.',

  // Cancellation reasons (CANCELLATION_REASONS)
  'Out of stock': 'نفدت الكمية',
  'Too busy to fulfil': 'ضغط الطلبات مرتفع جدًا',
  'Closing now': 'المطعم يغلق الآن',
  'Address cannot be delivered to': 'لا يمكن التوصيل إلى العنوان',
  'Administrative decision': 'قرار إداري',

  // Cart issues (CART_ISSUE_LABEL)
  'No longer available': 'لم يعد متاحًا',
  'Removed from the menu': 'أُزيل من القائمة',
  'Price changed': 'تغيّر السعر',
};
