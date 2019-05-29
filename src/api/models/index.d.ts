import { RestifyId, RestifyModelConfig } from '../modelConfig'
import { RestifyQuery } from '../constants'


export interface GetByIdConfig {
  query?: RestifyQuery;
  isNestedModel?: boolean;
  preventLoad?: boolean;
  forceLoad?: boolean;
  asyncGetters?: boolean;
  useModelEndpoint?: boolean;
}

export interface GetArrayConfig {
  filter?: {
    [key: string]: any;
  };
  sort?: string;
  parentEntities?: {
    [key: string]: RestifyId;
  };
  specialConfig?: boolean;
  modelConfig?: RestifyModelConfig;
}

export interface RestifyModelDefaults {
  [key: string]: any;
}

export interface RestifyFieldConfig {
  verboseName?: string;
  defaults?: RestifyModelDefaults,
}

export interface RestifyLinkedModelConfig extends RestifyFieldConfig {
  idField?: string;
  allowNested?: boolean;
  fetchConfig?: GetByIdConfig;
}

export interface RestifyGenericModelConfig extends RestifyLinkedModelConfig {
  typeField?: string;
}

export class RestifyField {
  constructor(connfig: RestifyFieldConfig);
  $isRestifyField: boolean;
  verboseName: string;
  defaults: RestifyModelDefaults;
}

export class RestifyLinkedModel extends RestifyField {
  constructor(modelType: string, config?: RestifyLinkedModelConfig)
  $isRestifyLinkedModel: boolean;
  modelType: string;
  idField: string;
  allowNested: boolean;
  fetchConfig: GetByIdConfig;
  getIdField: (modelField: string) => string;
}

export class RestifyForeignKey extends RestifyLinkedModel {
  constructor(modelType: string, config?: RestifyLinkedModelConfig)
  $isRestifyForeignKey: boolean;
}

export class RestifyForeignKeysArray extends RestifyLinkedModel {
  constructor(modelType: string, config?: RestifyLinkedModelConfig)
  $isRestifyForeignKeysArray: boolean;
}

export class RestifyGenericForeignKey extends RestifyLinkedModel {
  constructor(modelType: string | string[], config?: RestifyGenericModelConfig)
  $isRestifyGenericForeignKey: boolean;
  getTypeField: (modelField: string) => string;
}

export class RestifyArray extends RestifyField {
  constructor(config: RestifyFieldConfig)
  $isRestifyArray: boolean;
}

export type RestifyEntititesArray<T> = Array<T & { id: RestifyId }>

export class RestifyEntityList<T> {
  constructor(modelType: string | RestifyEntityList<T>);
  getById: (id?: RestifyId, config?: GetByIdConfig) => T;
  getIsLoadingById: (id: RestifyId, config?: GetByIdConfig | string) => boolean;
  asyncGetById: (id?: RestifyId, config?: GetByIdConfig) => Promise<T>;
  getByUrl: (url: string, config?: GetByIdConfig) => T;
  asyncGetByUrl: (url: string, config?: GetByIdConfig) => Promise<T>;
  getNextPage: (config?: GetArrayConfig) => number | undefined;
  getCount: (config?: GetArrayConfig) => number;
  getArray: (config?: GetArrayConfig) => RestifyEntititesArray<T>;
  getIsLoadingArray: (config?: GetArrayConfig) => boolean;
  asyncGetArray: (config?: GetArrayConfig) => Promise<RestifyEntititesArray<T>>;
}