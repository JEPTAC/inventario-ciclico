export const firebaseConfig = {
  apiKey: "AIzaSyDY-708fWezRJbY2T7eDQrN6sczYKTZyu4",
  authDomain: "inventario-ciclico-f53a3.firebaseapp.com",
  projectId: "inventario-ciclico-f53a3",
  storageBucket: "inventario-ciclico-f53a3.firebasestorage.app",
  messagingSenderId: "734931343871",
  appId: "1:734931343871:web:addb0b41404f2223ac2fca",
  measurementId: "G-3N16MP3BCS"
};

export const driveConfig = {
  clientId: "125993982318-gn2177d3muf2iip0co9pf9mii7d12cre.apps.googleusercontent.com",
  scopes: [
    "https://www.googleapis.com/auth/drive.metadata.readonly",
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/drive.file"
  ].join(" "),
  folderId: "1Njl9epGdr68LtlOzq3N0QcnXpcOZVFmQ",
  fileName: "Excel_siesa.xls",
  sheetName: "Sheet1"
};

export const defaultSettings = {
  dailyLimit: 30,
  alertDays: 3,
  activeCountingDays: [1, 2, 3, 4, 5],
  firstSampleLimit: 30,
  annualCoverageMode: true,
  dailySelectionMode: "pareto_random_no_repeat",
  movementMaturationDays: 3,
  cableMeterDays: 15,
  cableMeterMaturationDays: 15,
  cableYearCoverageMode: true,
  autoSyncHour: 8,
  autoSyncMinute: 0,
  sheetName: "Sheet1",
  cablePeriodDays: 15,
  cableCooldownDays: 15,
  cableYearSessions: 24,
  cableSessionLimit: 0,
  cableRandomSeed: "METRAJE_ANUAL",
  cableKeywords: [
    "cable", "conductor", "alambre", "encauchetado", "thhn", "awg",
    "cobre", "aluminio", "calibre", "duplex", "triplex", "caucho"
  ],
  bands: [
    { key: "A+", label: "Crítico / top costo y variabilidad", limit: 0.0025, frequency: 10 },
    { key: "A",  label: "Muy alto impacto", limit: 0.0100, frequency: 20 },
    { key: "B",  label: "Alto impacto", limit: 0.0250, frequency: 30 },
    { key: "C",  label: "Impacto medio", limit: 0.0750, frequency: 60 },
    { key: "D",  label: "Control general", limit: 0.1750, frequency: 90 },
    { key: "E",  label: "Bajo movimiento / residual", limit: 1.0000, frequency: 120 }
  ]
};
