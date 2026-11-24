import type { Store } from '@prisma/client';
import { decrypt } from './crypto.js';

export function mapStoreToApi(store: Store) {
  let sensitivityFactors: string[] = [];
  try {
    sensitivityFactors = JSON.parse(store.sensitivityFactors) as string[];
  } catch {
    sensitivityFactors = [];
  }
  return {
    id: store.id,
    name: store.name,
    category: store.category,
    address: decrypt(store.address),
    location: { lat: store.lat, lng: store.lng, x: store.mapX, y: store.mapY },
    employees: store.employees,
    yearsInBusiness: store.yearsInBusiness,
    avgDailyClients: store.avgDailyClients,
    sensitivityFactors,
    description: decrypt(store.description),
    dataRecords: store.dataRecords,
    status: store.status,
    isTest: store.isTest,
  };
}
