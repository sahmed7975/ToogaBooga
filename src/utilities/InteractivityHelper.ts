import {
    GuildMember, Message,
    MessageButton,
    MessageOptions,
    MessageSelectMenu,
    MessageSelectOptionData,
    TextChannel
} from "discord.js";
import {MessageUtilities} from "./MessageUtilities";
import {StringBuilder} from "./StringBuilder";
import {MongoManager} from "../managers/MongoManager";
import {AdvancedCollector} from "./collectors/AdvancedCollector";
import {Emojis} from "../constants/Emojis";
import {GuildFgrUtilities} from "./fetch-get-request/GuildFgrUtilities";
import {IGuildInfo, ISectionInfo} from "../definitions";

export namespace InteractivityHelper {

    /**
     * Asks a user for the section that he/she wants to perform an action on. This will send a message and then
     * either deletes the message once the question is asked or returns the message for later use.
     * @param {IGuildInfo} guildDb The guild document.
     * @param {GuildMember} member The member asking.
     * @param {TextChannel} channel The channel where this occurred.
     * @param {string} desc The description (i.e. instructions) to post.
     * @param {boolean} [returnMsg = false] Whether to also return the message object.
     * @return {Promise<ISectionInfo | null>} The section, if any. Null otherwise.
     */
    export async function getSectionQuery(guildDb: IGuildInfo, member: GuildMember, channel: TextChannel,
                                          desc: string,
                                          returnMsg: boolean = false): Promise<[ISectionInfo, Message | null] | null> {
        const allSections = MongoManager.getAllSections(guildDb);
        const selectOptions: MessageSelectOptionData[] = allSections
            .map(x => {
                const role = GuildFgrUtilities.getCachedRole(member.guild, x.roles.verifiedRoleId);
                return {
                    default: x.uniqueIdentifier === "MAIN",
                    label: x.sectionName,
                    description: role?.name ?? "No Member Role.",
                    value: x.uniqueIdentifier
                };
            });

        const msgOptions: MessageOptions = {
            embeds: [
                MessageUtilities.generateBlankEmbed(member, "RANDOM")
                    .setTitle("Select Section")
                    .setDescription(new StringBuilder(desc)
                        .appendLine().appendLine()
                        .append("If you wish to cancel this process, please press the `Cancel` button.").toString())
                    .setFooter("Section Selector")
            ],
            components: AdvancedCollector.getActionRowsFromComponents([
                new MessageSelectMenu()
                    .addOptions(...selectOptions)
                    .setCustomId("section_selector")
                    .setMinValues(1)
                    .setMaxValues(1),
                new MessageButton()
                    .setLabel("Cancel")
                    .setEmoji(Emojis.X_EMOJI)
                    .setCustomId("cancel_button")
                    .setStyle("DANGER")
            ])
        };

        const askMsg = await channel.send(msgOptions);
        const result = await AdvancedCollector.startInteractionCollector({
            targetChannel: channel,
            targetAuthor: member,
            acknowledgeImmediately: true,
            deleteBaseMsgAfterComplete: !returnMsg,
            duration: 60 * 1000,
            oldMsg: askMsg,
            clearInteractionsAfterComplete: true
        });

        // Button = guaranteed to be a button.
        if (!result || !result.isSelectMenu()) {
            if (returnMsg) await askMsg.delete().catch();
            return null;
        }

        if (returnMsg) await askMsg.delete().catch();
        return [allSections.find(x => x.uniqueIdentifier === result.values[0])!, askMsg.deleted ? null : askMsg];
    }

    /**
     * Asks a user for the section that he/she wants to perform an action on. If no `msgOptions` is specified, then
     * this will keep the original message content.
     * @param {IGuildInfo} guildDb The guild document.
     * @param {GuildMember} member The member asking.
     * @param {Message} message The message to use. This will edit the message, but not delete it.
     * @param {MessageOptions} [msgOptions] The message options. If specified, the bot will edit the given message
     * with whatever is contained here. Do not include any components.
     * @return {Promise<ISectionInfo | null>} The section, if any. Null otherwise.
     */
    export async function getSectionWithInitMsg(
        guildDb: IGuildInfo,
        member: GuildMember,
        message: Message,
        msgOptions?: Omit<MessageOptions, "components">
    ): Promise<ISectionInfo | null> {
        const allSections = MongoManager.getAllSections(guildDb);
        const selectOptions: MessageSelectOptionData[] = allSections
            .map(x => {
                const role = GuildFgrUtilities.getCachedRole(member.guild, x.roles.verifiedRoleId);
                return {
                    default: x.isMainSection,
                    label: x.sectionName,
                    description: role?.name ?? "No Member Role.",
                    value: x.uniqueIdentifier
                };
            });

        const needToAddComponents = message.components.length === 0;
        if (needToAddComponents) {
            const components = AdvancedCollector.getActionRowsFromComponents([
                new MessageSelectMenu()
                    .addOptions(...selectOptions)
                    .setCustomId("section_selector")
                    .setMinValues(1)
                    .setMaxValues(1),
                new MessageButton()
                    .setLabel("Cancel")
                    .setEmoji(Emojis.X_EMOJI)
                    .setCustomId("cancel_button")
                    .setStyle("DANGER")
            ]);
            let o: MessageOptions;
            if (msgOptions) {
                o = msgOptions;
                o.components = components;
            }
            else {
                o = MessageUtilities.getMessageOptionsFromMessage(message, components);
            }

            await message.edit(o).catch();
        }

        const result = await AdvancedCollector.startInteractionCollector({
            targetChannel: message.channel as TextChannel,
            targetAuthor: member,
            acknowledgeImmediately: true,
            deleteBaseMsgAfterComplete: false,
            duration: 60 * 1000,
            oldMsg: message,
            clearInteractionsAfterComplete: needToAddComponents
        });

        // Button = guaranteed to be a button.
        if (!result || !result.isSelectMenu()) return null;
        return allSections.find(x => x.uniqueIdentifier === result.values[0])!;
    }
}