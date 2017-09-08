import { createSelector } from 'reselect'

import { EntityList, RestifyForeignKey, RestifyForeignKeysArray } from '../models'
import { RESTIFY_CONFIG } from '../../config'
import { onInitRestify } from '../../init'
import { isPureObject } from 'helpers/def'
import { getNestedObjectField } from 'helpers/nestedObjects'

import { getUrls } from './loadsManager'


const entityLists = {}

const getModelSelectorsFromDict = (selectorsDict) => (modelType) => {
  const modelConfig = RESTIFY_CONFIG.registeredModels[modelType].defaults

  const getLinkedModels = (configPath = []) => (memo, key) => {
    const currentConfigPath = configPath.concat(key)
    const currentField = getNestedObjectField(modelConfig, currentConfigPath)
    if (currentField instanceof RestifyForeignKey || currentField instanceof RestifyForeignKeysArray) {
      if (currentField.modelType === modelType) return memo
      return memo.concat(currentField.modelType)
    } else if (isPureObject(currentField) && !Array.isArray(currentField)) {
      return memo.concat(Object.keys(currentField).reduce(getLinkedModels(currentConfigPath), []))
    }
    return memo
  }
  const linkedModelsNames = Object.keys(modelConfig).reduce(getLinkedModels(), [])
  return Object.keys(selectorsDict).reduce((memo, key) => ({
    ...memo,
    [key]: selectorsDict[key](modelType, linkedModelsNames),
  }), {})
}

const globalSelectors = {
  getPages: (modelType) => (state) => state.api.entityManager[modelType].pages,
  getSingles: (modelType) => (state) => state.api.entityManager[modelType].singleEntities,
  getLoadErrors: (modelType) => (state) => state.api.entityManager[modelType].loadErrorEntities,
  getCount: (modelType) => (state) => state.api.entityManager[modelType].count,

  getEntities: (modelType, linkedModelsNames) => createSelector(
    [
      globalSelectors.getPages(modelType),
      globalSelectors.getSingles(modelType),
      globalSelectors.getLoadErrors(modelType),
      globalSelectors.getCount(modelType),
      getUrls(RESTIFY_CONFIG.registeredModels[modelType].endpoint),
      ...linkedModelsNames.map(modelName => getModelSelectorsFromDict(globalSelectors)(modelName).getEntities),
    ],
    (pages, singles, errors, count, urls, ...linkedModels) => {
      const source = entityLists[modelType] || modelType
      const newList = new EntityList(source)
      entityLists[modelType] = newList
      newList.setDispatch(RESTIFY_CONFIG.store.dispatch)
      const linkedModelsDict = linkedModels.reduce((memo, item) => ({
        ...memo,
        [item.modelType]: item,
      }), {})
      newList.setSource(pages, singles, errors, count, urls, linkedModelsDict)
      return newList
    },
  ),
}

const getModelSelectors = getModelSelectorsFromDict(globalSelectors)

const entityManager = {}

// This way we avoid recreating selectors(makes them useless),
// opposite to using getModelSelectors function directly every time
onInitRestify(() => {
  RESTIFY_CONFIG.modelsTypes.forEach(modelType => {
    entityManager[modelType] = getModelSelectors(modelType)
  })
})

export default entityManager
