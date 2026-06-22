/**
 * Diagram object groups — member refs: cbox:id, label:id, node:key (vanilla JS).
 * Persisted in master layout v14+ as `groups: [{ id, members[] }]`.
 */
(function (global) {
  'use strict';

  var KINDS = { cbox: 'cbox', label: 'label', node: 'node' };

  function makeMemberRef(kind, id) {
    if (!kind || id == null) return '';
    return String(kind) + ':' + String(id);
  }

  function parseMemberRef(ref) {
    if (!ref || typeof ref !== 'string') return null;
    var i = ref.indexOf(':');
    if (i <= 0) return null;
    var kind = ref.slice(0, i);
    var id = ref.slice(i + 1);
    if (!id || (kind !== KINDS.cbox && kind !== KINDS.label && kind !== KINDS.node)) return null;
    return { kind: kind, id: id, ref: ref };
  }

  function isGroupableRef(ref) {
    var p = parseMemberRef(ref);
    return !!(p && (p.kind === KINDS.cbox || p.kind === KINDS.label || p.kind === KINDS.node));
  }

  function normalizeGroups(groups) {
    if (!Array.isArray(groups)) return [];
    var out = [];
    var seen = new Set();
    groups.forEach(function (g) {
      if (!g || typeof g !== 'object' || !g.id) return;
      var gid = String(g.id);
      if (seen.has(gid)) return;
      seen.add(gid);
      var members = [];
      var mseen = new Set();
      if (Array.isArray(g.members)) {
        g.members.forEach(function (m) {
          if (!isGroupableRef(m) || mseen.has(m)) return;
          mseen.add(m);
          members.push(m);
        });
      }
      if (members.length >= 2) out.push({ id: gid, members: members });
    });
    return out;
  }

  function findGroupForMember(ref, groups) {
    if (!ref) return null;
    var list = normalizeGroups(groups);
    for (var i = 0; i < list.length; i++) {
      if (list[i].members.indexOf(ref) >= 0) return list[i];
    }
    return null;
  }

  function expandWithGroupMembers(refs, groups) {
    var list = normalizeGroups(groups);
    var out = [];
    var seen = new Set();
    (refs || []).forEach(function (r) {
      if (!r || seen.has(r)) return;
      seen.add(r);
      out.push(r);
      var g = findGroupForMember(r, list);
      if (g) {
        g.members.forEach(function (m) {
          if (!seen.has(m)) {
            seen.add(m);
            out.push(m);
          }
        });
      }
    });
    return out;
  }

  function anyMemberInGroup(refs, groups) {
    for (var i = 0; i < (refs || []).length; i++) {
      if (findGroupForMember(refs[i], groups)) return true;
    }
    return false;
  }

  function createGroup(members, groups) {
    var list = normalizeGroups(groups);
    var clean = [];
    var seen = new Set();
    (members || []).forEach(function (m) {
      if (!isGroupableRef(m) || seen.has(m)) return;
      if (findGroupForMember(m, list)) return;
      seen.add(m);
      clean.push(m);
    });
    if (clean.length < 2) return null;
    var id = 'grp-' + Date.now();
    var grp = { id: id, members: clean };
    list.push(grp);
    groups.length = 0;
    list.forEach(function (g) {
      groups.push(g);
    });
    return grp;
  }

  function dissolveGroup(groupId, groups) {
    if (!groupId || !Array.isArray(groups)) return false;
    var i = -1;
    for (var j = 0; j < groups.length; j++) {
      if (groups[j] && String(groups[j].id) === String(groupId)) {
        i = j;
        break;
      }
    }
    if (i < 0) return false;
    groups.splice(i, 1);
    return true;
  }

  function remapMemberRef(ref, idMap) {
    var p = parseMemberRef(ref);
    if (!p || !idMap) return ref;
    var nk = p.kind + ':' + p.id;
    return idMap[nk] || ref;
  }

  function remapGroups(groups, idMap) {
    return normalizeGroups(groups).map(function (g) {
      return {
        id: g.id,
        members: g.members.map(function (m) {
          return remapMemberRef(m, idMap);
        }),
      };
    });
  }

  global.AEPDiagram = global.AEPDiagram || {};
  global.AEPDiagram.groups = {
    KINDS: KINDS,
    makeMemberRef: makeMemberRef,
    parseMemberRef: parseMemberRef,
    isGroupableRef: isGroupableRef,
    normalizeGroups: normalizeGroups,
    findGroupForMember: findGroupForMember,
    expandWithGroupMembers: expandWithGroupMembers,
    anyMemberInGroup: anyMemberInGroup,
    createGroup: createGroup,
    dissolveGroup: dissolveGroup,
    remapGroups: remapGroups,
    remapMemberRef: remapMemberRef,
  };
})(typeof window !== 'undefined' ? window : this);
