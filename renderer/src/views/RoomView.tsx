import { ChannelList } from "../ChannelList";
import { DmPanel } from "./DmPanel";
import { HomeSidebar } from "./HomeSidebar";
import { MemberPane } from "../MemberPane";
import { MessageArea } from "../MessageArea";
import { MobileDrawers } from "./MobileDrawers";
import { ServerList } from "../ServerList";

export function RoomView(props: any) {
  const {
    authed,
    isNarrow,
    HOME_ID,

    rooms,
    roomsLoading,
    selectedRoomId,
    setSelectedRoomId,
    openCreateRoom,

    openAddFriend,
    openHomeAudit,
    homeAuditBusy,
    homeError,
    addFriendOpen,
    homeLoading,
    friends,
    openDmWith,
    deleteFriend,
    requests,
    acceptRequest,
    rejectRequest,

    tree,
    treeLoading,
    selectedChannelId,
    selectedChannelName,
    selectChannelAndMarkRead,
    unreadByChannelId,
    notifications,
    setNotifications,
    openNotification,
    openCreateCategory,
    openInviteModal,
    openCreateChannel,
    openDeleteCategory,
    openDeleteChannel,

    memberPane,
    memberPaneLoading,
    memberPaneError,

    currentUserId,
    displayName,
    currentUserAvatarUrl,
    openSettings,

    enterKeySends,
    focusMessage,
    setFocusMessage,
    setFocusDmMessage,

    // DM state/handlers
    selectedDmPeerName,
    selectedDmThreadId,
    dmListRef,
    dmLoading,
    dmError,
    dmMessages,
    dmHighlightId,
    dmReactionPickerFor,
    setDmReactionPickerFor,
    toggleDmReaction,
    dmText,
    setDmText,
    dmSending,
    sendDm,
    openDmSearch,
    dmSearchOpen,
    closeDmSearch,
    dmSearchBusy,
    dmSearchQ,
    setDmSearchQ,
    setDmSearchOpen,
    dmSearchError,
    dmSearchItems,
    dmSearchHasMore,
    runDmSearch,
    dmSearchInputRef,

    // User actions
    openUserActions,

    // Mobile
    mobileDrawer,
    setMobileDrawer,
    openJoinModal,
    avatarDataUrl,
  } = props;

  if (!authed) return null;

  return (
    <div
      style={{
        display: "flex",
        position: "fixed",
        top: "var(--app-offset-top)",
        left: "var(--app-offset-left)",
        height: "var(--app-height)",
        width: "calc(100vw - var(--app-offset-left))",
        background: "#36393f",
        overflowX: "hidden",
        paddingBottom: "var(--app-occluded-bottom)",
        boxSizing: "border-box",
      }}
    >
      {!isNarrow && rooms && (
        <ServerList
          rooms={rooms}
          selectedRoomId={selectedRoomId}
          onSelectRoom={setSelectedRoomId}
          onRequestCreateRoom={roomsLoading ? undefined : openCreateRoom}
          homeId={HOME_ID}
        />
      )}

      {selectedRoomId === HOME_ID ? (
        !isNarrow ? (
          <HomeSidebar
            openAddFriend={openAddFriend}
            openHomeAudit={openHomeAudit}
            homeAuditBusy={homeAuditBusy}
            homeError={homeError}
            addFriendOpen={addFriendOpen}
            homeLoading={homeLoading}
            friends={friends}
            openDmWith={openDmWith}
            deleteFriend={deleteFriend}
            requests={requests}
            acceptRequest={acceptRequest}
            rejectRequest={rejectRequest}
          />
        ) : null
      ) : !isNarrow && tree ? (
        <ChannelList
          tree={tree}
          selectedChannelId={selectedChannelId}
          onSelectChannel={selectChannelAndMarkRead}
          unreadByChannelId={unreadByChannelId}
          notifications={notifications}
          onClearNotifications={() => setNotifications([])}
          onDismissNotification={(id) => setNotifications((prev: any[]) => prev.filter((n: any) => n.id !== id))}
          onOpenNotification={openNotification}
          onRequestCreateCategory={
            treeLoading
              ? undefined
              : tree.room.owner_id && currentUserId && tree.room.owner_id === currentUserId
                ? openCreateCategory
                : undefined
          }
          onOpenRoomSettings={tree.room.owner_id ? openInviteModal : undefined}
          onRequestCreateChannel={
            treeLoading
              ? undefined
              : tree.room.owner_id && currentUserId && tree.room.owner_id === currentUserId
                ? openCreateChannel
                : undefined
          }
          onRequestDeleteCategory={
            tree.room.owner_id && currentUserId && tree.room.owner_id === currentUserId ? openDeleteCategory : undefined
          }
          onRequestDeleteChannel={
            tree.room.owner_id && currentUserId && tree.room.owner_id === currentUserId ? openDeleteChannel : undefined
          }
          currentUserName={displayName || currentUserId || "user"}
          currentUserAvatarUrl={currentUserAvatarUrl}
          onOpenSettings={currentUserId ? openSettings : undefined}
        />
      ) : null}

      {selectedRoomId === HOME_ID ? (
        <DmPanel
          selectedDmPeerName={selectedDmPeerName}
          selectedDmThreadId={selectedDmThreadId}
          enterKeySends={enterKeySends}
          dmListRef={dmListRef}
          dmLoading={dmLoading}
          dmError={dmError}
          dmMessages={dmMessages}
          dmHighlightId={dmHighlightId}
          dmReactionPickerFor={dmReactionPickerFor}
          setDmReactionPickerFor={setDmReactionPickerFor}
          toggleDmReaction={toggleDmReaction}
          dmText={dmText}
          setDmText={setDmText}
          dmSending={dmSending}
          sendDm={sendDm}
          openDmSearch={openDmSearch}
          dmSearchOpen={dmSearchOpen}
          closeDmSearch={closeDmSearch}
          dmSearchBusy={dmSearchBusy}
          dmSearchQ={dmSearchQ}
          setDmSearchQ={setDmSearchQ}
          dmSearchError={dmSearchError}
          dmSearchItems={dmSearchItems}
          dmSearchHasMore={dmSearchHasMore}
          runDmSearch={runDmSearch}
          dmSearchInputRef={dmSearchInputRef}
          onPickSearchResult={(messageId) => {
            if (!selectedDmThreadId) return;
            setFocusDmMessage((prev: any) => ({
              threadId: selectedDmThreadId,
              messageId,
              nonce: (prev?.nonce ?? 0) + 1,
            }));
            setDmSearchOpen(false);
          }}
        />
      ) : (
        <div style={{ display: "flex", flex: 1, height: "var(--app-height)" }}>
          <MessageArea
            roomId={tree?.room?.id ?? null}
            selectedChannelId={selectedChannelId}
            selectedChannelName={selectedChannelName}
            onAuthorClick={({ userId, displayName: dn }) => openUserActions(userId, { displayName: dn })}
            currentUserId={currentUserId}
            canModerate={!!(tree?.room.owner_id && currentUserId && tree.room.owner_id === currentUserId)}
            mentionCandidates={memberPane.map((m: any) => ({ userId: m.userId, displayName: m.displayName }))}
            enterKeySends={enterKeySends}
            focusMessageId={focusMessage?.messageId ?? null}
            focusMessageNonce={focusMessage?.nonce ?? 0}
            onJumpToMessage={({ channelId, messageId }) => {
              setFocusMessage((prev: any) => ({ messageId, nonce: (prev?.nonce ?? 0) + 1 }));
              selectChannelAndMarkRead(channelId);
            }}
          />
          {!isNarrow && (
            <MemberPane
              members={memberPane}
              loading={memberPaneLoading}
              error={memberPaneError}
              onMemberClick={(m) => openUserActions(m.userId, { displayName: m.displayName, hasAvatar: m.hasAvatar })}
            />
          )}
        </div>
      )}

      <MobileDrawers
        authed={authed}
        isNarrow={isNarrow}
        mobileDrawer={mobileDrawer}
        setMobileDrawer={setMobileDrawer}
        HOME_ID={HOME_ID}
        rooms={rooms}
        roomsLoading={roomsLoading}
        selectedRoomId={selectedRoomId}
        setSelectedRoomId={setSelectedRoomId}
        openCreateRoom={openCreateRoom}
        openJoinModal={openJoinModal}
        tree={tree}
        treeLoading={treeLoading}
        selectedChannelId={selectedChannelId}
        unreadByChannelId={unreadByChannelId}
        currentUserId={currentUserId}
        displayName={displayName}
        currentUserAvatarUrl={currentUserAvatarUrl}
        openSettings={openSettings}
        selectChannelAndMarkRead={selectChannelAndMarkRead}
        openNotification={openNotification}
        openCreateCategory={openCreateCategory}
        openInviteModal={openInviteModal}
        openCreateChannel={openCreateChannel}
        openDeleteCategory={openDeleteCategory}
        openDeleteChannel={openDeleteChannel}
        avatarDataUrl={avatarDataUrl}
        notifications={notifications}
        setNotifications={setNotifications}
        openAddFriend={openAddFriend}
        openHomeAudit={openHomeAudit}
        homeAuditBusy={homeAuditBusy}
        homeLoading={homeLoading}
        friends={friends}
        openDmWith={openDmWith}
        openUserActions={openUserActions}
        requests={requests}
        acceptRequest={acceptRequest}
        rejectRequest={rejectRequest}
        memberPane={memberPane}
        memberPaneLoading={memberPaneLoading}
        memberPaneError={memberPaneError}
      />
    </div>
  );
}
