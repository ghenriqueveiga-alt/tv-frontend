export const environment = {
  production: false,
  adsense: {
    publisherId: 'ca-pub-6258304823757222',  // ca-pub-XXXXXXXXXXXXXXXX
    slotSideRail: '4510159406', // Slot ID for left/right rail ads
  },
  API_URL: 'http://localhost:8080',
  timezoneOffsetHours: 0,
  // Carteiras de doação: alimentam o QR do player e a página de anúncios.
  donations: {
    bitcoin: 'bc1qmp9z67g7w7w36e0q5swdqhmhzd9dka0p6jmah2',
    ethereum: '0x6741678F5a82A999c4aA639499D0d6E4db30872f',
    binance: '0xE240c9D767938de8e07b0261272b692a6072a876', // BNB Chain
    solana: '8261Mjoa7aEPkhdg43HJryL1xHSwZWrL4mmqvnyYmPWH',
    tron: 'THdtfaafhNXxxRZJJUizPvLSB6XNn4i1Jm',
    polygon: '0xE240c9D767938de8e07b0261272b692a6072a876',
    lightning: '',
  },
};
