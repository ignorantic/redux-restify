import uuidV4 from 'uuid/v4'
import sortBy from 'lodash/sortBy'
import merge from 'lodash/merge'
import { batchActions } from 'redux-batched-actions'

import {
  ACTIONS_TYPES,
  ARRAY_DEFAULTS_INDEX,
  ARRAY_CONFIG_INDEX,
  getActionType,
  GENERAL_FORMS_ACTIONS,
  getFormArrayConfig,
  getFormDefaultValue,
  updateDefaultValue,
} from './constants'
import createFormConfig from './formConfig'
import selectors, { checkErrors } from './selectors'
import { ValidationPreset } from './validation'

import { objectToLowerSnake } from 'helpers/namingNotation'
import { isPureObject } from 'helpers/def'
import { mutateObject, getRecursiveObjectReplacement, getNestedObjectField } from 'helpers/nestedObjects'

import api from '../api'
import { RESTIFY_CONFIG } from '../config'
import { onInitRestify } from '../init'
import { ACTION_UPDATE, ACTION_CREATE } from '../constants'


const generalActions = {
  deleteForm: (formType) => ({
    type: ACTIONS_TYPES[GENERAL_FORMS_ACTIONS].deleteForm,
    formType,
  }),

  resetForm: (formType) => ({
    type: ACTIONS_TYPES[GENERAL_FORMS_ACTIONS].resetForm,
    formType,
  }),

  renameForm: (formType, formName) => ({
    type: ACTIONS_TYPES[GENERAL_FORMS_ACTIONS].renameForm,
    formType,
    formName,
  }),

  createForm: (formType, config, allowRecreate = false) => (dispatch, getState) => {
    if (allowRecreate && selectors.getIsFormExist(formType)(getState())) {
      dispatch(generalActions.deleteForm(formType))
    }
    return dispatch({
      type: ACTIONS_TYPES[GENERAL_FORMS_ACTIONS].createForm,
      formType,
      config,
    })
  },
}

const globalActions = {
  deleteForm: (formType) => () => generalActions.deleteForm(formType),
  resetForm: (formType) => () => generalActions.resetForm(formType),
  renameForm: (formType) => (formName) => generalActions.renameForm(formType, formName),

  changeField: (formType) => (name, newValue) => (dispatch, getState) => {
    let value = newValue

    const state = getState()
    const currentFormConfig = selectors.getFormConfig(formType)(state)

    // Manage orderable arrays
    if (Array.isArray(value)) {
      const arrayConfig = getFormArrayConfig(formType, name, currentFormConfig)
      if (arrayConfig.orderable) {
        value = value.map((item, order) => ({ ...item, order }))
      }
    }

    dispatch({
      type: getActionType(formType).changeField,
      name,
      value,
      formType,
    })

    if (currentFormConfig.validate && currentFormConfig.validateOnFieldChange) {
      dispatch(globalActions.validate(formType)())
    }
  },

  changeSomeFields: (formType) => (fieldsObject = {}, forceUndefines = false) => (dispatch) => {
    Object.keys(fieldsObject).forEach(key => {
      const currentValue = fieldsObject[key]
      if (!forceUndefines || currentValue !== undefined) {
        dispatch(globalActions.changeField(formType)(key, currentValue))
      }
    })
  },

  applyServerData: (formType) => (data) => (dispatch, getState) => {
    const state = getState()
    const currentFormConfig = selectors.getFormConfig(formType)(state)

    const dataReduceFunc = (prevName) => (obj) => {
      if (typeof obj !== 'object' || obj === null) return obj
      if (Array.isArray(obj)) {
        const arrayConfig = getFormArrayConfig(formType, prevName, currentFormConfig)
        if (arrayConfig.orderable) {
          return sortBy(obj, 'order')
        }
        return obj
      }
      return Object.keys(obj).reduce((memo, key) => ({
        ...memo,
        [key]: dataReduceFunc(prevName.concat(key))(obj[key]),
      }), {})
    }

    return dispatch(globalActions.changeSomeFields(formType)(dataReduceFunc([])(data)))
  },

  resetField: (formType) => (name) => ({
    type: getActionType(formType).resetField,
    name,
    formType,
  }),

  insertToArray: (formType) => (arrayName, value, insertingIndex) => (dispatch, getState) => {
    const state = getState()
    const currentFormConfig = selectors.getFormConfig(formType)(state)
    const configArrayName = !Array.isArray(arrayName) ? arrayName : arrayName.map(name => {
      return typeof name === 'string' ? name : 0
    })
    const arrayConfig = getNestedObjectField(currentFormConfig.defaults, configArrayName)[ARRAY_CONFIG_INDEX]

    // fakeId plugin
    let newValue = value
    if (arrayConfig && arrayConfig.fakeId) {
      newValue = {
        ...newValue,
        id: uuidV4(),
      }
    }
    newValue = updateDefaultValue(
      getFormDefaultValue(formType, [].concat(arrayName, 0), currentFormConfig),
      newValue,
    )
    const newArray = selectors.getField(formType)(arrayName)(state).slice()
    let index = insertingIndex
    if (index !== undefined) {
      if (index < 0) {
        index = 0
      }
      if (index > newArray.length) {
        index = newArray.length
      }
      newArray.splice(index, 0, newValue)
    } else {
      newArray.push(newValue)
    }
    dispatch(globalActions.changeField(formType)(arrayName, newArray))
    return index === undefined ? newArray.length - 1 : index
  },

  insertToArrayAndEdit: (formType) => (arrayName, value, index) => (dispatch) => {
    const newIndex = dispatch(globalActions.insertToArray(formType)(arrayName, value, index))
    dispatch(globalActions.rememberFieldState(formType)([].concat(arrayName, newIndex), null))
  },

  manageSavedFieldArrayDeletion: (formType) => (arrayName, index) => (dispatch, getState) => {
    const state = getState()
    const editingFields = selectors.getEditingFields(formType)(state)
    const arrayEditingFields = getNestedObjectField(editingFields, arrayName)
    const batchedActions = []
    Object.keys(arrayEditingFields || {}).map(key => +key).forEach(key => {
      if (key < index) return
      const currentPath = [].concat(arrayName, key)
      if (key === index) {
        batchedActions.push(globalActions.saveEditingField(formType)(currentPath))
      } else {
        const rememberedField = arrayEditingFields[key]
        batchedActions.push(globalActions.saveEditingField(formType)(currentPath))
        batchedActions.push(globalActions.rememberFieldState(formType)([].concat(arrayName, key - 1), rememberedField))
      }
    })

    dispatch(batchActions(batchedActions))
  },

  manageSavedFieldArrayInsertion: (formType) => (arrayName, index, insertedField) => (dispatch, getState) => {
    const state = getState()
    const editingFields = selectors.getEditingFields(formType)(state)
    const arrayEditingFields = getNestedObjectField(editingFields, arrayName)
    const batchedActions = []
    Object.keys(arrayEditingFields || {}).map(key => +key).forEach(key => {
      if (key < index) return
      const currentPath = [].concat(arrayName, key)
      batchedActions.push(globalActions.saveEditingField(formType)(currentPath))
      if (key === index && insertedField) {
        batchedActions.push(globalActions.rememberFieldState(formType)(currentPath, insertedField))
      } else {
        const rememberedField = arrayEditingFields[key]
        batchedActions.push(globalActions.rememberFieldState(formType)([].concat(arrayName, key + 1), rememberedField))
      }
    })

    dispatch(batchActions(batchedActions))
  },

  removeFromArray: (formType) => (arrayName, index = 0, count = 1) => (dispatch, getState) => {
    const state = getState()
    const newArray = selectors.getField(formType)(arrayName)(state).slice()
    newArray.splice(index, count)
    // TODO reset all arrays for count
    dispatch(globalActions.changeField(formType)(arrayName, newArray))
    dispatch(globalActions.resetArrayErrors(formType)(arrayName, newArray.length))
    dispatch(globalActions.manageSavedFieldArrayDeletion(formType)(arrayName, index))
  },

  replaceInArray: (formType) => (arrayName, value, index) => (dispatch, getState) => {
    const state = getState()
    const currentFormConfig = selectors.getFormConfig(formType)(state)
    const newValue = updateDefaultValue(
      getFormDefaultValue(formType, [].concat(arrayName, 0), currentFormConfig),
      value,
    )
    const newArray = selectors.getField(formType)(arrayName)(state).slice()
    newArray.splice(index, 1, newValue)
    dispatch(globalActions.changeField(formType)(arrayName, newArray))
  },

  moveInArray: (formType) => (arrayName, movingIndex, insertingIndex) => (dispatch, getState) => {
    const state = getState()
    const currentValue = selectors.getField(formType)([].concat(arrayName, movingIndex))(state)
    const newArray = selectors.getField(formType)(arrayName)(state).slice()
    // We should not reuse insertion/deletion actions here, due to rerenders and animations lagging
    newArray.splice(movingIndex, 1)
    dispatch(globalActions.manageSavedFieldArrayDeletion(formType)(arrayName, movingIndex))
    newArray.splice(insertingIndex, 0, currentValue)

    const editingFields = selectors.getEditingFields(formType)(state)
    const arrayEditingFields = getNestedObjectField(editingFields, arrayName)
    if (arrayEditingFields) {
      const editableInsertedValue = arrayEditingFields[movingIndex]
      dispatch(globalActions.manageSavedFieldArrayInsertion(formType)(arrayName, insertingIndex, editableInsertedValue))
    }

    dispatch(globalActions.changeField(formType)(arrayName, newArray))
  },

  moveInArrayUp: (formType) => (arrayName, movingIndex) => (dispatch) => {
    dispatch(globalActions.moveInArray(formType)(arrayName, movingIndex, movingIndex - 1))
  },

  moveInArrayDown: (formType) => (arrayName, movingIndex) => (dispatch) => {
    dispatch(globalActions.moveInArray(formType)(arrayName, movingIndex, movingIndex + 1))
  },

  changeInArray: (formType) => (arrayName, name, value, index) => (dispatch, getState) => {
    const state = getState()
    const currentArray = selectors.getField(formType)(arrayName)(state)
    const newValue = {
      ...currentArray[index],
      [name]: value,
    }
    dispatch(globalActions.replaceInArray(formType)(arrayName, newValue, index))
  },

  setErrors: (formType) => (value) => ({
    type: getActionType(formType).setErrors,
    value,
    formType,
  }),

  resetErrors: (formType) => () => ({
    type: getActionType(formType).setErrors,
    value: {},
    formType,
  }),

  setFieldError: (formType) => (name, value) => (dispatch, getState) => {
    return dispatch({
      type: getActionType(formType).setErrors,
      value: getRecursiveObjectReplacement(selectors.getErrors(formType)(getState()), name, value),
      formType,
    })
  },

  resetFieldError: (formType) => (name) => (dispatch, getState) => {
    return dispatch({
      type: getActionType(formType).setErrors,
      value: getRecursiveObjectReplacement(selectors.getErrors(formType)(getState()), name, []),
      formType,
    })
  },

  resetArrayErrors: (formType) => (arrayName, index) => (dispatch, getState) => {
    const state = getState()
    const currentArrayErrors = getNestedObjectField(selectors.getErrors(formType)(state), arrayName) || {}
    return dispatch(globalActions.setFieldError(formType)(arrayName, {
      ...currentArrayErrors,
      [index]: {},
    }))
  },

  setArrayFieldErrors: (formType) => (arrayName, name, value, index) => (dispatch, getState) => {
    const state = getState()
    const currentArrayErrors = getNestedObjectField(selectors.getErrors(formType)(state), arrayName) || {}
    const currentArrayFieldErrors = currentArrayErrors[index] || {}
    return dispatch(globalActions.setFieldError(formType)(arrayName, {
      ...currentArrayErrors,
      [index]: getRecursiveObjectReplacement(currentArrayFieldErrors, name, value),
    }))
  },

  resetArrayFieldErrors: (formType) => (arrayName, name, index) => (dispatch) => {
    return dispatch(globalActions.setArrayFieldErrors(formType)(arrayName, name, [], index))
  },

  rememberFieldState: (formType) => (name, value) => ({
    type: getActionType(formType).rememberFieldState,
    value,
    name,
    formType,
  }),

  enableFieldEditMode: (formType) => (name) => (dispatch, getState) => {
    const state = getState()
    const fieldToRemember = selectors.getField(formType)(name)(state)
    return dispatch(globalActions.rememberFieldState(formType)(name, fieldToRemember))
  },

  saveEditingField: (formType) => (name) => ({
    type: getActionType(formType).saveEditingField,
    name,
    formType,
  }),

  validate: (formType) => () => (dispatch, getState) => {
    const state = getState()
    const currentForm = selectors.getFormConfig(formType)(state)
    if (!currentForm.validate) return {}

    const currentValues = selectors.getForm(formType)(state)

    let validationResult = {}
    const addToValidationResult = (value, field) => {
      let fieldKey = field
      if (!fieldKey.length && !isPureObject(value)) {
        fieldKey = '$global'
      }
      validationResult = getRecursiveObjectReplacement(validationResult, fieldKey, value)
    }
    const calucalateCurrentLevelValidate = (currentLevelValues, validationField, currentPath = []) => {
      if (validationField instanceof ValidationPreset) {
        addToValidationResult(validationField.validate(currentLevelValues, currentValues), currentPath)
      } else if (typeof validationField === 'function') {
        addToValidationResult(validationField(currentLevelValues, currentValues), currentPath)
      } else if (validationField !== null && typeof validationField === 'object') {
        Object.keys(validationField).forEach(key => {
          addToValidationResult(calucalateCurrentLevelValidate(
            currentLevelValues && currentLevelValues[key],
            validationField[key],
            currentPath.concat(key),
          ), currentPath)
        })
      }
    }
    calucalateCurrentLevelValidate(currentValues, currentForm.validate)
    const currentErrors = selectors.getErrors(formType)(state)
    const newErrors = merge({}, currentErrors, validationResult)
    dispatch(globalActions.setErrors(formType)(newErrors))
    return newErrors
  },

  cancelFieldEdit: (formType) => (name) => (dispatch, getState) => {
    const state = getState()
    const savedField = selectors.getSavedField(formType)(name)(state)
    if (savedField === null) {
      const arrayName = name.slice(0, name.length - 1)
      const index = name[name.length - 1]
      dispatch(globalActions.removeFromArray(formType)(arrayName, index))
    } else {
      dispatch(globalActions.changeField(formType)(name, savedField))
      dispatch(globalActions.saveEditingField(formType)(name))
    }
  },

  submit: (formType) => () => (dispatch, getState) => {
    const state = getState()
    const currentForm = selectors.getFormConfig(formType)(state)
    if (currentForm.validate && currentForm.validateOnSubmit) {
      const errors = dispatch(globalActions.validate(formType)())
      if (!checkErrors(errors)) {
        return Promise.reject(errors)
      }
    }
    if (!currentForm.endpoint && !currentForm.model) {
      if (process.env.DEV) {
        console.warn(`Submitting a form ${formType} has no effect, cause it doesn't have endpoint or model`)
      }
      return Promise.resolve()
    }
    const currentValues = selectors.getFormWithNulls(formType)(state)


    let submitExcludeFunc = currentForm.submitExclude
    if (typeof currentForm.submitExclude === 'object') {
      submitExcludeFunc = (key, values, keyParentPath) => {
        return getNestedObjectField(currentForm.submitExclude, keyParentPath.concat(key)) === true
      }
    }
    const data = mutateObject(
      (key, value, obj, keyParentPath) => {
        if (submitExcludeFunc(key, currentValues, keyParentPath)) return true
        // fakeId plugin checks for fake uuids(string, instead of number) not to send them
        let parentConfig
        if (Array.isArray(keyParentPath)) {
          parentConfig = keyParentPath.reduce((memo, name, index) => {
            if (!memo || !memo[name]) return undefined
            const currentObj = memo[name]
            if (Array.isArray(currentObj)) {
              return currentObj[index === keyParentPath.length - 1 ? ARRAY_CONFIG_INDEX : ARRAY_DEFAULTS_INDEX]
            }
            return currentObj
          }, currentForm.defaults)
        } else {
          parentConfig = currentForm.defaults[keyParentPath]
          if (Array.isArray(parentConfig)) {
            parentConfig = parentConfig[ARRAY_CONFIG_INDEX]
          }
        }
        if (!parentConfig) return false
        if (parentConfig && parentConfig.fakeId && key === 'id') {
          return typeof value === 'string'
        }
        return false
      },
      () => undefined,
    )(currentValues)

    return new Promise((resolve, reject) => {
      const successCallbacks = []
      const errorCallbacks = []
      if (currentForm.deleteOnSubmit) {
        successCallbacks.push(generalActions.deleteForm(formType))
      }
      if (currentForm.resetOnSubmit) {
        successCallbacks.push(generalActions.resetForm(formType))
      }
      if (currentForm.onSuccess) {
        successCallbacks.push(currentForm.onSuccess)
      }

      let url = currentForm.endpoint
      if (typeof url === 'function') {
        url = url(currentValues)
      }
      let currentApiName = currentForm.apiName
      const currentId = data.id || currentForm.id
      if (currentForm.model) {
        const currentModel = RESTIFY_CONFIG.registeredModels[currentForm.model]
        url = currentModel.endpoint
        currentApiName = currentModel.apiName
        if (currentId) {
          dispatch(api.actions.entityManager[currentForm.model].updateOptimisticById(currentId, data))
          errorCallbacks.push(api.actions.entityManager[currentForm.model].discardOptimisticUpdateById(currentId))
        }
        if (currentForm.updateEntity) {
          successCallbacks.push((res) => () => {
            dispatch(api.actions.entityManager[currentForm.model].updateById(res.id, res))
          })
        }
        const actionType = currentId ? ACTION_UPDATE : ACTION_CREATE
        successCallbacks.push(() => api.actions.entityManager[currentForm.model].showEntityAlert(actionType))
      }

      // Workaround for dispatching callbacks(behaves like thunk function)
      successCallbacks.push((res, status) => () => resolve({ data: res, status }))
      errorCallbacks.push((res, status) => () => reject({ data: res, status }))

      errorCallbacks.push(globalActions.setErrors(formType))

      const defaultMethod = currentId ? 'patch' : 'post'
      dispatch(api.actions.callApi(currentForm.method ? currentForm.method.toLowerCase() : defaultMethod)({
        apiName: currentApiName,
        url: currentId ? `${url}${currentId}/${currentForm.specialAction}` : `${url}${currentForm.specialAction}`,
        onError: errorCallbacks,
        onSuccess: successCallbacks,
        data: currentForm.convertToSnakeCaseBeforeSend ? objectToLowerSnake(data) : data,
        convertToCamelCase: currentForm.convertResultToCamelCase,
        removeNulls: currentForm.resultRemoveNulls,
        orderArrays: currentForm.resultOrderArrays,
        withoutPrefix: currentForm.withoutPrefix,
      }))
    })
  },
}

export const getFormActions = (formType) => {
  return Object.keys(globalActions).reduce((memo, key) => ({
    ...memo,
    [key]: globalActions[key](formType),
  }), {})
}

const forms = {
  ...globalActions,
  ...generalActions,

  sendQuickForm: (config) => (dispatch) => {
    const newForm = createFormConfig({
      ...config,
      deleteOnSubmit: true,
    })
    const formName = uuidV4()
    dispatch(generalActions.createForm(formName, newForm, true))
    return dispatch(globalActions.submit(formName)())
  },
}

onInitRestify(() => {
  RESTIFY_CONFIG.formsTypes.forEach(formType => {
    forms[formType] = getFormActions(formType)
  })
})

export default forms
