import forms from '../forms'

import { getNestedObjectField } from 'helpers/nestedObjects'

import {
  store,
  beforeEachFunc,
} from './testConfigs'


describe('forms', () => {
  beforeEach(beforeEachFunc)

  it('changes a field with name(array or string path)', () => {
    const fieldNames = [
      'fieldName',
      ['firstName', 'secondName'],
    ]
    const fieldValue = 'fieldValue'

    fieldNames.forEach(name => {
      store.dispatch(forms.actions.testForm.changeField(name, fieldValue))
      const state = store.getState()
      const form = forms.selectors.testForm.getForm(state)
      expect(getNestedObjectField(form, name)).toEqual(fieldValue)
    })
  })

  it('changes a some fields with object', () => {
    const fields = {
      firstFieldName: 'firstFieldValue',
      secondFieldName: 'secondFieldValue',
    }

    store.dispatch(forms.actions.testForm.changeSomeFields(fields))
    Object.keys(fields).forEach(key => {
      const state = store.getState()
      const form = forms.selectors.testForm.getForm(state)
      expect(getNestedObjectField(form, key)).toEqual(fields[key])
    })
  })

  it('changes an array and maintain order fields)', () => {
    const arrayToChange = [{ test: true }, { test: false }]
    const arrayToCheck = [{ test: true, order: 0 }, { test: false, order: 1 }]
    const arrayToCheckReverse = [{ test: false, order: 0 }, { test: true, order: 1 }]

    const actions = [
      forms.actions.testForm.changeField('testArray', arrayToChange),
      forms.actions.testForm.changeField('testArray', [...arrayToChange].reverse()),
      forms.actions.testForm.changeSomeFields({ testArray: arrayToChange }),
      forms.actions.testForm.changeSomeFields({ testArray: [...arrayToChange].reverse() }),
    ]

    actions.forEach((action, index) => {
      store.dispatch(action)
      const state = store.getState()
      const form = forms.selectors.testForm.getForm(state)
      expect(form.testArray).toEqual(index % 2 ? arrayToCheckReverse : arrayToCheck)
    })
  })
})