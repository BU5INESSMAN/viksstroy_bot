export const copyToClipboard = (text, linkType, setCopiedLink) => {
    navigator.clipboard.writeText(text).then(() => {
        setCopiedLink(linkType);
        setTimeout(() => setCopiedLink(''), 2000);
    });
};
