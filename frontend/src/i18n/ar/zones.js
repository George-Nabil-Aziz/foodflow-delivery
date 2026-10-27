/**
 * Arabic catalogue: delivery zones - the restaurant's delivery radius, the
 * "does not deliver to your address" states and the checkout message.
 */
export default {
  // Discovery: restaurant card and page
  "Doesn't deliver to your address": 'لا يوصّل إلى عنوانك',
  Distance: 'المسافة',
  '{n} km': '{n} كم',
  'Delivers within': 'يوصّل ضمن',
  'Your address is {distance} km away and this restaurant delivers within {radius} km. Choose another address or restaurant.':
    'عنوانك يبعد {distance} كم، وهذا المطعم يوصّل ضمن {radius} كم. اختر عنوانًا أو مطعمًا آخر.',

  // Checkout
  'This restaurant delivers within {radius} km, and this address is {distance} km away. Choose another address.':
    'هذا المطعم يوصّل ضمن {radius} كم، وهذا العنوان يبعد {distance} كم. اختر عنوانًا آخر.',

  // Restaurant owner's profile and the admin's restaurant details
  'Delivery radius (km)': 'نطاق التوصيل (كم)',
  'Delivery radius': 'نطاق التوصيل',
  'Between 1 and 30': 'بين 1 و30',
  'Delivery radius must be between 1 and 30 km': 'يجب أن يكون نطاق التوصيل بين 1 و30 كم',
  Latitude: 'خط العرض',
  Longitude: 'خط الطول',
  "Needed to check customers' addresses against your delivery radius":
    'مطلوب للتحقق من عناوين العملاء مقابل نطاق التوصيل لديك',

  // API: error.message (PUBLIC_MESSAGES)
  'This restaurant does not deliver to this address.': 'هذا المطعم لا يوصّل إلى هذا العنوان.',
};
