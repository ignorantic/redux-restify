import { RESTIFY_CONFIG } from '../../config'
import { DEFAULT_API_NAME } from '../constants'
import { ACTIONS_TYPES } from '../actionsTypes'


const invokeCallback = (dispatch, callback, res) => {
  switch (typeof callback) {
    case 'function' :
      return dispatch(callback(res.data, res.status, res.api))
    case 'string':
      return dispatch({
        type: callback,
        data: res.data,
        status: res.status,
        api: res.api,
      })
    case 'object':
      return dispatch(callback)
    default:
      return callback
  }
}

export const callApi = method => ({
  apiName = DEFAULT_API_NAME,
  url,
  onSuccess,
  onError,
  ...other
}) => (dispatch) => {
  if (!RESTIFY_CONFIG.registeredApies[apiName]) {
    throw new Error(`Calling unregistered api ${apiName}! Register api, before calling it.`)
  }

  return RESTIFY_CONFIG.registeredApies[apiName].callApi(url, method, {
    orderField: RESTIFY_CONFIG.options.orderableFormFieldName,
    retries: RESTIFY_CONFIG.options.retries,
    retryTimeoutMs: RESTIFY_CONFIG.options.retryTimeoutMs,
    ...other,
  })
  .then(res => {
    const resultActionType = res.status >= 300 ? onError : onSuccess
    const callbacks = Array.isArray(resultActionType) ? resultActionType : [resultActionType]
    callbacks.forEach(callback => invokeCallback(dispatch, callback, res))
    return res
  })
  .catch(res => {
    // Network problems
    if (res.status === 0) {
      const callbacks = Array.isArray(onError) ? onError : [onError]
      callbacks.forEach(callback => invokeCallback(dispatch, callback, res))
    }
    // TODO by @deylak may be shouldn't throw 401, cause of handling it earlier
    if (res.status !== 401) throw res
  })
}

export const callGet = callApi('get')
export const callPost = callApi('post')
export const callPut = callApi('put')
export const callPatch = callApi('patch')
export const callDel = callApi('delete')

export const resetEntityManager = () => ({
  type: ACTIONS_TYPES.entityManager.clearData,
})

export const updateEntityManagerData = (data, modelConfig) => ({
  type: ACTIONS_TYPES.entityManager.updateData,
  data,
  modelConfig,
})
