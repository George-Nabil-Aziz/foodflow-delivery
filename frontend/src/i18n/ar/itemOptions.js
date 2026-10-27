/**
 * Arabic catalogue: item options (spec-15) - the add-to-cart dialog, the
 * owner's option editor, cart issue labels and the API's option messages.
 */
export default {
  // Add-to-cart dialog and menu card
  'Choose options': 'اختر الإضافات',
  'Sizes, extras or notes available': 'أحجام وإضافات وملاحظات متاحة',
  'Choose 1 (required)': 'اختر واحدًا (مطلوب)',
  'Choose up to {max} (optional)': 'اختر حتى {max} (اختياري)',
  'Choose {min} (required)': 'اختر {min} (مطلوب)',
  'Choose {min} to {max} (required)': 'اختر من {min} إلى {max} (مطلوب)',
  'Note for the kitchen (optional)': 'ملاحظة للمطبخ (اختياري)',
  'For example: no onions': 'مثال: بدون بصل',
  'Make the required choices to continue.': 'أكمل الاختيارات المطلوبة للمتابعة.',
  'Add to cart': 'أضف إلى السلة',
  'Requires option choices: the customer must order this item themselves.':
    'يتطلب هذا الصنف اختيارات: يجب على العميل طلبه بنفسه.',

  // Cart issues (CART_ISSUE_LABEL)
  'A chosen option is no longer available. Remove this item and add it again.':
    'أحد الخيارات التي اخترتها لم يعد متاحًا. أزل هذا الصنف وأضفه مرة أخرى.',
  'A chosen option was removed from the menu. Remove this item and add it again.':
    'أُزيل أحد الخيارات التي اخترتها من القائمة. أزل هذا الصنف وأضفه مرة أخرى.',
  'The choices for this item changed. Remove it and add it again.':
    'تغيّرت اختيارات هذا الصنف. أزله وأضفه مرة أخرى.',

  // Owner: option editor
  'Options ({count})': 'الإضافات ({count})',
  'Options for {name}': 'إضافات {name}',
  'Loading...': 'جارٍ التحميل...',
  'No options yet. Add a group such as Size or Extras.': 'لا توجد إضافات بعد. أضف مجموعة مثل الحجم أو الإضافات.',
  'Group name': 'اسم المجموعة',
  Min: 'الأدنى',
  Max: 'الأقصى',
  'Save group': 'حفظ المجموعة',
  'Move group up': 'نقل المجموعة لأعلى',
  'Move group down': 'نقل المجموعة لأسفل',
  'Delete group': 'حذف المجموعة',
  Optional: 'اختياري',
  'Option name': 'اسم الخيار',
  'Extra price': 'السعر الإضافي',
  'Move option up': 'نقل الخيار لأعلى',
  'Move option down': 'نقل الخيار لأسفل',
  'New option': 'خيار جديد',
  'Add option': 'إضافة خيار',
  'Add option group': 'إضافة مجموعة خيارات',
  'Options, one per line, with an optional extra price': 'الخيارات، واحد في كل سطر، مع سعر إضافي اختياري',
  'Min 1 makes the group required. Max 1 means choose one.': 'الحد الأدنى 1 يجعل المجموعة مطلوبة. الحد الأقصى 1 يعني اختيار واحد.',

  // API messages
  'The chosen options are not valid for this item.': 'الخيارات المختارة غير صالحة لهذا الصنف.',
  'An option you chose is no longer offered.': 'أحد الخيارات التي اخترتها لم يعد متاحًا.',
  'Removing this option would leave customers unable to order the item.':
    'حذف هذا الخيار سيجعل طلب الصنف مستحيلًا على العملاء.',
  'maxSelect must be at least 1 and at least minSelect': 'يجب ألا يقل الحد الأقصى عن 1 ولا عن الحد الأدنى',
  'at least one option is required': 'يلزم خيار واحد على الأقل',
};
