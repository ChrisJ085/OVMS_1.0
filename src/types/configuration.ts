import { BaseDocument } from './common';

export interface SiteConfig extends BaseDocument {
  siteCode: string;
  siteName: string;
  timezone: string;
  metadata?: Record<string, any>;
}

export type DestinationType = 'INTERNAL_SITE' | 'EXTERNAL_SITE' | 'CUSTOMER' | 'OVERFLOW' | 'OTHER';

export interface Destination extends BaseDocument {
  destinationCode: string;
  destinationName: string;
  destinationType: DestinationType;
  defaultColour?: string;
  sortOrder: number;
  metadata?: Record<string, any>;
}

export interface UnitOfMeasure extends BaseDocument {
  code: string;
  name: string;
  quantityPrecision: number;
  metadata?: Record<string, any>;
}

export interface ProductCategory extends BaseDocument {
  code: string;
  name: string;
  description?: string;
  metadata?: Record<string, any>;
}

export type StorageAreaType = 'HIGH_BAY' | 'BULK' | 'MARSHALLING' | 'STAGING' | 'OTHER';

export interface StorageArea extends BaseDocument {
  siteId: string; // Required for site-scoped
  areaCode: string;
  areaName: string;
  areaType: StorageAreaType;
  sortOrder: number;
  metadata?: Record<string, any>;
}

export interface ProductionLine extends BaseDocument {
  siteId: string; // Required for site-scoped
  lineCode: string;
  lineName: string;
  sapResourceCode?: string;
  sapResourceAliases?: string[];
  metadata?: Record<string, any>;
}

export interface ActionType extends BaseDocument {
  code: string;
  label: string;
  meaning: string;
  colourToken: string;
  iconKey: string;
  sortOrder: number;
  metadata?: Record<string, any>;
}

export interface PriorityLevel extends BaseDocument {
  code: string;
  label: string;
  numericWeight: number;
  colourToken: string;
  sortOrder: number;
  metadata?: Record<string, any>;
}
