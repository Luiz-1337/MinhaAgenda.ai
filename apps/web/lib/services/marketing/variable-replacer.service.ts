/**
 * Serviço para substituição de variáveis em templates de mensagens
 */

export class VariableReplacerService {
  /**
   * Substitui variáveis em um template de mensagem
   * @param template Template da mensagem com variáveis no formato {{variavel}}
   * @param variables Objeto com os valores das variáveis
   * @returns Mensagem com variáveis substituídas
   */
  static replaceVariables(template: string, variables: Record<string, string>): string {
    let result = template

    // Substitui cada variável encontrada
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g')
      result = result.replace(regex, value || '')
    }

    return result
  }

  /**
   * Extrai todas as variáveis encontradas no template
   * @param template Template da mensagem
   * @returns Array com os nomes das variáveis encontradas (sem {{ }})
   */
  static extractVariables(template: string): string[] {
    const regex = /\{\{(\w+)\}\}/g
    const variables: string[] = []
    let match

    while ((match = regex.exec(template)) !== null) {
      if (!variables.includes(match[1])) {
        variables.push(match[1])
      }
    }

    return variables
  }
}
