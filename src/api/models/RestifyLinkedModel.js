class RestifyLinkedModel {
  constructor(modelType, {
    idField, // Postfix to model name, to store it's id in normalized form
    allowNested = true, // Allowing calculate this entity in other linked models
  } = {}) {
    this.$isRestifyLinkedModel = true
    this.modelType = modelType
    this.idField = idField
    this.allowNested = allowNested
  }

  getIdField(modelField) {
    return `${modelField}${this.idField}`
  }
}

export default RestifyLinkedModel
