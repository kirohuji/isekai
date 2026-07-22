// 将 apps/api/data 下的全部 CSV 导入 SQLite。所有静态定义均按源 ID upsert，重复执行安全。
import { PrismaClient } from '@prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'

import { loadAllData } from '../src/data/loader'

const prisma = new PrismaClient({
  adapter: new PrismaLibSql({ url: 'file:./data/gray-hill.db' }),
})

async function main() {
  console.log('🌱 开始导入种子数据...\n')
  const data = loadAllData()

  for (const event of data.eventTemplates) {
    try {
      JSON.parse(event.conditionJson)
      JSON.parse(event.choicesJson)
    } catch (error) {
      throw new Error(`事件模板 [${event.id}] ${event.name} 包含无效 JSON`, { cause: error })
    }
  }

  // 日志依赖事件模板；重建模板集，避免旧版导入留下已从 CSV 删除的事件。
  await prisma.eventLog.deleteMany()
  await prisma.eventTemplate.deleteMany()

  // 不使用批量 $transaction：libSQL 适配器在 Prisma 7.9 的 batch transaction
  // 中会错误复用 delegate；逐条 upsert 可正常工作，也方便定位损坏的源行。
  for (const location of data.locations) {
    const value = {
      name: location.name, region: location.region, description: location.description,
      isSafe: location.isSafe, travelCost: location.connections[0]?.travelCost ?? 0,
      connectedLocations: JSON.stringify(location.connections.map(({ targetId }) => targetId)),
      specialTags: JSON.stringify(location.tags),
    }
    await prisma.location.upsert({ where: { id: location.id }, create: { id: location.id, ...value }, update: value })
  }

  for (const npc of data.npcs) {
    const npcValue = {
      race: npc.race, isRecruitable: npc.isRecruitable, personalityType: npc.personalityType,
      occupation: npc.occupation, dialogueTopics: JSON.stringify(npc.dialogueTopics ?? []),
    }
    await prisma.character.upsert({
      where: { id: npc.id },
      create: {
        id: npc.id, name: npc.name, gender: npc.gender, description: npc.description,
        locationId: npc.locationId, npc: { create: npcValue },
      },
      update: {
        name: npc.name, gender: npc.gender, description: npc.description, locationId: npc.locationId,
        npc: { upsert: { create: npcValue, update: npcValue } },
      },
    })
  }

  for (const event of data.eventTemplates) {
    const value = { name: event.name, category: event.category, narrativeBase: event.narrativeBase, conditionJson: event.conditionJson, choicesJson: event.choicesJson, cooldownDays: event.cooldownTurns, isRepeatable: event.isRepeatable, priority: event.priority }
    await prisma.eventTemplate.upsert({ where: { id: event.id }, create: { id: event.id, ...value }, update: value })
  }
  for (const item of data.items) {
    const value = { name: item.name, type: item.type, weight: item.weight, description: item.description, baseBuyPrice: item.baseBuyPrice, baseSellPrice: item.baseSellPrice, equipModifiers: item.equipModifiers ? JSON.stringify(item.equipModifiers) : null }
    await prisma.itemDefinition.upsert({ where: { id: item.id }, create: { id: item.id, ...value }, update: value })
  }
  for (const skill of data.skills) {
    const value = { name: skill.name, category: skill.category, maxLevel: skill.maxLevel, levelEffects: JSON.stringify(skill.levelEffects) }
    await prisma.skillDefinition.upsert({ where: { id: skill.id }, create: { id: skill.id, ...value }, update: value })
  }
  for (const enemy of data.enemies) {
    const value = { name: enemy.name, attack: enemy.baseAttack, defense: enemy.baseDefense, maxHp: enemy.maxHp, loot: JSON.stringify(enemy.loot ?? []), region: enemy.region ?? '' }
    await prisma.enemyDefinition.upsert({ where: { id: enemy.id }, create: { id: enemy.id, ...value }, update: value })
  }
  for (const merchant of data.merchants) {
    const value = { npcId: merchant.npcId, name: merchant.name, priceModifier: merchant.priceModifier, sells: JSON.stringify(merchant.sells), buys: JSON.stringify(merchant.buys) }
    await prisma.merchantDefinition.upsert({ where: { id: merchant.id }, create: { id: merchant.id, ...value }, update: value })
  }
  for (const rule of data.rules) {
    const value = { name: rule.name, bindType: rule.bindType, bindId: rule.bindId, conditionType: rule.conditionType, conditionParams: JSON.stringify(rule.conditionParams), effectType: rule.effectType, effectParams: JSON.stringify(rule.effectParams), priority: rule.priority, description: rule.description }
    await prisma.ruleDefinition.upsert({ where: { id: rule.id }, create: { id: rule.id, ...value }, update: value })
  }
  for (const quest of data.quests) {
    await prisma.questTemplate.upsert({ where: { id: quest.id }, create: quest, update: quest })
  }
  for (const topic of data.dialogueTopics) {
    await prisma.dialogueTopic.upsert({ where: { npcId_topicId: { npcId: topic.npcId, topicId: topic.topicId } }, create: topic, update: topic })
  }
  for (const recipe of data.crafting) {
    const value = { name: recipe.name, inputItems: JSON.stringify(recipe.inputItems), inputQuantities: JSON.stringify(recipe.inputQuantities), outputItem: recipe.outputItem, outputQuantity: recipe.outputQuantity, requiredSkill: recipe.requiredSkill, requiredLevel: recipe.requiredLevel, craftTimeBlocks: recipe.craftTimeBlocks }
    await prisma.craftingRecipe.upsert({ where: { id: recipe.id }, create: { id: recipe.id, ...value }, update: value })
  }

  console.log('📊 数据汇总:')
  console.log(`  地点 ${data.locations.length} · NPC ${data.npcs.length} · 物品 ${data.items.length} · 事件 ${data.eventTemplates.length}`)
  console.log(`  技能 ${data.skills.length} · 敌人 ${data.enemies.length} · 商人 ${data.merchants.length} · 规则 ${data.rules.length}`)
  console.log(`  任务 ${data.quests.length} · 对话 ${data.dialogueTopics.length} · 配方 ${data.crafting.length}`)
  console.log('\n🎉 种子数据导入完成！')
}

main()
  .catch(error => { console.error('❌ 种子数据导入失败:', error); process.exitCode = 1 })
  .finally(async () => prisma.$disconnect())
